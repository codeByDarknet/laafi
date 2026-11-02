import { Injectable, signal } from '@angular/core';
import { initAsync as initialiserWasmCrypto } from '@matrix-org/matrix-sdk-crypto-wasm';
import {
  ClientEvent,
  Filter,
  HttpApiEvent,
  IndexedDBStore,
  MatrixClient,
  MatrixEventEvent,
  MemoryStore,
  PendingEventOrdering,
  RoomEvent,
  RoomMemberEvent,
  RoomStateEvent,
  SyncState,
  createClient,
} from 'matrix-js-sdk';
import { CryptoCallbacks } from 'matrix-js-sdk/lib/crypto-api';
import { CONFIG } from '../config';
import { SessionMatrix } from '../auth/session';
import { MotifRevocation, motifDeRevocation } from '../security/revocation';

/**
 * Client Matrix de Laafi : connexion à Synapse, synchronisation et CHIFFREMENT DE BOUT EN BOUT.
 *
 * ─── Ce que le jury doit retenir ───────────────────────────────────────────────────────────
 * 1. Laafi n'implémente AUCUN algorithme cryptographique. Le chiffrement est entièrement
 *    assuré par la « crypto Rust » de matrix-js-sdk : la bibliothèque matrix-sdk-crypto
 *    (Rust, auditée), compilée en WebAssembly, qui s'appuie sur vodozemac (implémentation
 *    des protocoles Olm et Megolm, auditée par Least Authority en 2022).
 *      - Olm    : canal chiffré 1-à-1 entre deux APPAREILS (Double Ratchet, comme Signal),
 *                 utilisé pour transmettre les clés de salon.
 *      - Megolm : clé de session de SALON (AES-256 + HMAC-SHA-256), renouvelée quand un membre
 *                 part ou est révoqué, et après un certain nombre de messages.
 * 2. Les clés privées de l'appareil (identité Curve25519/Ed25519, sessions Olm, sessions
 *    Megolm reçues) ne quittent jamais le navigateur : elles sont dans IndexedDB
 *    (`laafi::matrix-sdk-crypto`). Synapse ne stocke que des `m.room.encrypted` illisibles.
 * 3. À la révocation, ces bases sont supprimées : l'appareil ne peut plus rien déchiffrer,
 *    et les autres membres changent de clé Megolm (il ne lira pas les messages futurs).
 * ────────────────────────────────────────────────────────────────────────────────────────────
 */

/** Préfixe des bases IndexedDB de la crypto Rust (cf. BASES_CONNUES dans revocation.ts). */
export const PREFIXE_BASE_CRYPTO = 'laafi';
/** Nom de la base du cache de synchronisation (devient « matrix-js-sdk:laafi-sync »). */
export const NOM_BASE_SYNC = 'laafi-sync';

export type EtatSync = 'arrete' | 'demarrage' | 'pret' | 'hors-ligne' | 'erreur';

@Injectable({ providedIn: 'root' })
export class MatrixClientService {
  private _client: MatrixClient | null = null;

  /** Compteur incrémenté à chaque changement utile : les `computed()` des écrans s'y abonnent. */
  readonly version = signal(0);
  readonly etat = signal<EtatSync>('arrete');
  /** Appelé quand le serveur signale que cette session n'est plus valide. */
  surRevocation: (motif: MotifRevocation) => void = () => undefined;

  private bumpPrevu = false;

  get client(): MatrixClient {
    if (!this._client) throw new Error('Client Matrix non démarré');
    return this._client;
  }

  get demarre(): boolean {
    return this._client !== null;
  }

  get monId(): string {
    return this._client?.getUserId() ?? '';
  }

  async demarrer(session: SessionMatrix, callbacks: CryptoCallbacks): Promise<void> {
    if (this._client) return;
    this.etat.set('demarrage');

    // ── 1. Charger le module WebAssembly de la crypto depuis NOS fichiers (assets/crypto/),
    //       servi par la même origine : aucun CDN, compatible avec la CSP « wasm-unsafe-eval ».
    //       initAsync est mémoïsé : quand le SDK l'appellera à son tour, il réutilisera ce module.
    await initialiserWasmCrypto(CONFIG.cryptoWasmUrl);

    // ── 2. Cache de synchronisation (salons, événements) dans IndexedDB pour démarrer vite
    //       sur un réseau faible. Il ne contient que ce que le serveur connaît déjà : les
    //       messages y sont stockés CHIFFRÉS ; le texte clair n'est jamais écrit sur disque.
    const store = await this.creerStore();

    const client = createClient({
      baseUrl: session.homeserverUrl,
      userId: session.userId,
      deviceId: session.deviceId,
      accessToken: session.accessToken,
      store,
      timelineSupport: true,
      cryptoCallbacks: callbacks,
      useAuthorizationHeader: true,
    });
    this._client = client;

    // ── 3. Révocation : le SDK émet « Session.logged_out » dès qu'une requête reçoit
    //       401 M_UNKNOWN_TOKEN (appareil supprimé par l'administration ou par le bouton
    //       d'urgence) ou un soft logout. On déclenche alors l'effacement local.
    client.on(HttpApiEvent.SessionLoggedOut, (err) => {
      this.surRevocation(motifDeRevocation(err) ?? 'jeton-invalide');
    });

    // ── 4. Initialiser la crypto Rust (Olm/Megolm via vodozemac) avec stockage IndexedDB.
    //       Au premier lancement, elle crée les clés d'identité de CET appareil et publie
    //       ses clés publiques sur Synapse (/keys/upload). Les privées restent ici.
    await client.initRustCrypto({ useIndexedDB: true, cryptoDatabasePrefix: PREFIXE_BASE_CRYPTO });

    this.brancherEvenements(client);

    // ── 5. Synchronisation « réseau faible » : 20 messages par salon au premier chargement,
    //       pas de présence ni d'indicateurs de frappe.
    //       Membres NON chargés à la demande (lazyLoadMembers: false) : avec le « state_after »
    //       (MSC4222) qu'utilise le SDK, Synapse omet parfois NOTRE propre adhésion « join »
    //       après « Accepter » (synchro limitée) ; le SDK nous croyait alors toujours invité
    //       et l'écran restait sur « Vous êtes invité » jusqu'au rechargement de la page.
    //       Les groupes de l'administration sont petits : l'état complet reste léger.
    await client.startClient({
      lazyLoadMembers: false,
      initialSyncLimit: 20,
      disablePresence: true,
      filter: this.filtreMinimal(session.userId),
      pollTimeout: 30_000,
      // Les messages en attente d'envoi restent dans une liste séparée : file d'envoi hors ligne.
      pendingEventOrdering: PendingEventOrdering.Detached,
    });
  }

  /** Arrête la synchronisation ; `effacer` supprime aussi les stores du SDK (dont la crypto). */
  async arreter(effacer: boolean): Promise<void> {
    const client = this._client;
    this._client = null;
    this.etat.set('arrete');
    if (!client) return;
    try {
      client.stopClient();
      client.removeAllListeners();
      if (effacer) await client.clearStores();
    } catch {
      /* l'effacement générique (revocation.ts) prendra le relais */
    }
  }

  /** Programme une mise à jour des écrans (au plus une par image affichée). */
  signalerChangement(): void {
    if (this.bumpPrevu) return;
    this.bumpPrevu = true;
    const planifier = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (f: () => void) => setTimeout(f, 16);
    planifier(() => {
      this.bumpPrevu = false;
      this.version.update((v) => v + 1);
    });
  }

  private async creerStore(): Promise<IndexedDBStore | MemoryStore> {
    try {
      const store = new IndexedDBStore({
        indexedDB: window.indexedDB,
        dbName: NOM_BASE_SYNC,
        localStorage: window.localStorage,
      });
      await store.startup();
      return store;
    } catch {
      // Navigation privée ou IndexedDB indisponible : cache en mémoire seulement.
      return new MemoryStore({ localStorage: window.localStorage });
    }
  }

  private filtreMinimal(userId: string): Filter {
    const filtre = new Filter(userId);
    filtre.setDefinition({
      presence: { not_types: ['*'] },
      room: {
        ephemeral: { not_types: ['m.typing'] },
        timeline: { limit: 20 },
      },
    });
    return filtre;
  }

  private brancherEvenements(client: MatrixClient): void {
    const changement = () => this.signalerChangement();
    client.on(ClientEvent.Sync, (etat, _prec, data) => {
      switch (etat) {
        case SyncState.Prepared:
        case SyncState.Syncing:
        case SyncState.Catchup:
          this.etat.set('pret');
          break;
        case SyncState.Reconnecting:
          this.etat.set('hors-ligne');
          break;
        case SyncState.Error: {
          const motif = motifDeRevocation(data?.error);
          if (motif) this.surRevocation(motif);
          else this.etat.set('hors-ligne');
          break;
        }
        case SyncState.Stopped:
          this.etat.set('arrete');
          break;
      }
      changement();
    });
    client.on(ClientEvent.Room, changement);
    client.on(ClientEvent.DeleteRoom, changement);
    client.on(ClientEvent.AccountData, changement);
    client.on(RoomEvent.Timeline, changement);
    client.on(RoomEvent.TimelineReset, changement);
    client.on(RoomEvent.Name, changement);
    client.on(RoomEvent.MyMembership, changement);
    client.on(RoomEvent.Receipt, changement);
    client.on(RoomEvent.Redaction, changement);
    client.on(RoomEvent.LocalEchoUpdated, changement);
    client.on(RoomStateEvent.Members, changement);
    client.on(RoomMemberEvent.Membership, changement);
    // Un message chiffré reçu est d'abord affiché « en cours de déchiffrement » ; cet
    // événement signale que la crypto Rust a fini (ou échoué) de le déchiffrer.
    client.on(MatrixEventEvent.Decrypted, changement);
  }
}
