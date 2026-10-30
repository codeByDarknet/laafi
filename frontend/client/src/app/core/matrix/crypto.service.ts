import { Injectable, inject, signal } from '@angular/core';
import { CryptoCallbacks, decodeRecoveryKey } from 'matrix-js-sdk/lib/crypto-api';
import type { SecretStorageKeyDescription } from 'matrix-js-sdk/lib/secret-storage';
import { MatrixClientService } from './matrix-client.service';

/**
 * Vérification d'appareils, signature croisée et clé de récupération.
 *
 * ─── Explication pour le jury ──────────────────────────────────────────────────────────────
 * Chiffrer ne suffit pas : il faut savoir À QUI on chiffre. Chaque appareil possède une paire
 * de clés d'identité (Ed25519). Un attaquant qui contrôlerait le serveur pourrait ajouter un
 * faux appareil au compte d'un agent pour recevoir les clés de salon. D'où :
 *
 *  - SIGNATURE CROISÉE (cross-signing) : l'agent possède une clé « maîtresse » qui signe ses
 *    propres appareils. Un appareil signé par la clé maîtresse est « vérifié » ; un appareil
 *    ajouté à l'insu de l'agent ne l'est pas et l'interface le signale.
 *  - STOCKAGE SECRET (SSSS) : les clés privées de signature croisée et la clé de sauvegarde
 *    des messages sont chiffrées sur le serveur avec une CLÉ DE RÉCUPÉRATION que seul l'agent
 *    connaît (affichée une seule fois). Le serveur ne peut pas les lire.
 *  - SAUVEGARDE DES CLÉS : les clés Megolm reçues sont sauvegardées chiffrées ; un nouvel
 *    appareil, une fois la clé de récupération saisie, peut relire l'historique autorisé.
 *
 * Toutes ces opérations sont faites par la crypto Rust de matrix-js-sdk (aucun code maison) :
 * ce service ne fait que les orchestrer et garder la clé de récupération EN MÉMOIRE le temps
 * de l'opération (jamais sur disque).
 * ────────────────────────────────────────────────────────────────────────────────────────────
 */

export interface EtatCrypto {
  /** La crypto Rust est active (clés d'appareil publiées). */
  active: boolean;
  /** Cet appareil est signé par la clé maîtresse de l'agent. */
  appareilVerifie: boolean;
  /** Les clés de signature croisée existent et sont utilisables ici. */
  signatureCroiseePrete: boolean;
  /** Le compte possède déjà des clés de signature croisée (créées sur un autre appareil). */
  compteAvecCles: boolean;
  /** Le stockage secret (clé de récupération) est configuré. */
  stockageSecretPret: boolean;
  /** Empreinte publique Ed25519 de cet appareil (à comparer lors d'une vérification). */
  empreinteAppareil: string | null;
}

export interface AppareilAffiche {
  deviceId: string;
  nom: string;
  derniereActivite: number | null;
  courant: boolean;
  verifie: boolean | null;
}

@Injectable({ providedIn: 'root' })
export class CryptoService {
  private readonly matrix = inject(MatrixClientService);

  /** Clés de stockage secret connues pendant la session (mémoire vive uniquement). */
  private readonly clesEnMemoire = new Map<string, Uint8Array<ArrayBuffer>>();
  /** Clé saisie par l'agent, essayée sur la clé par défaut du compte. */
  private cleCandidate: Uint8Array<ArrayBuffer> | null = null;

  readonly etat = signal<EtatCrypto | null>(null);

  /** Callbacks donnés à createClient : le SDK nous demande la clé quand il doit lire le SSSS. */
  callbacks(): CryptoCallbacks {
    return {
      getSecretStorageKey: async ({ keys }) => {
        for (const keyId of Object.keys(keys)) {
          const connue = this.clesEnMemoire.get(keyId);
          if (connue) return [keyId, connue];
        }
        if (this.cleCandidate) {
          for (const [keyId, info] of Object.entries(keys)) {
            if (await this.cleCorrespond(this.cleCandidate, info)) {
              this.clesEnMemoire.set(keyId, this.cleCandidate);
              return [keyId, this.cleCandidate];
            }
          }
        }
        return null;
      },
      cacheSecretStorageKey: (keyId, _info, cle) => {
        this.clesEnMemoire.set(keyId, cle);
      },
    };
  }

  async rafraichir(): Promise<EtatCrypto | null> {
    if (!this.matrix.demarre) return null;
    const client = this.matrix.client;
    const crypto = client.getCrypto();
    if (!crypto) {
      this.etat.set(null);
      return null;
    }
    const userId = client.getSafeUserId();
    const deviceId = client.getDeviceId() ?? '';
    const [statut, pret, compteAvecCles, ssss, cles] = await Promise.all([
      crypto.getDeviceVerificationStatus(userId, deviceId).catch(() => null),
      crypto.isCrossSigningReady().catch(() => false),
      crypto.userHasCrossSigningKeys(userId, true).catch(() => false),
      crypto.isSecretStorageReady().catch(() => false),
      crypto.getOwnDeviceKeys().catch(() => null),
    ]);
    const etat: EtatCrypto = {
      active: true,
      appareilVerifie: statut?.crossSigningVerified ?? false,
      signatureCroiseePrete: pret,
      compteAvecCles,
      stockageSecretPret: ssss,
      empreinteAppareil: cles ? formaterEmpreinte(cles.ed25519) : null,
    };
    this.etat.set(etat);
    return etat;
  }

  /**
   * PREMIER APPAREIL de l'agent : crée la signature croisée, le stockage secret et la
   * sauvegarde des clés, puis renvoie la clé de récupération à afficher UNE SEULE FOIS.
   *
   * L'envoi des clés de signature croisée exige normalement une ré-authentification
   * (UIA). Synapse l'accepte sans mot de passe pour la toute première publication
   * (MSC3967) ; c'est le cas ici puisque l'agent vient de se connecter par SSO.
   */
  async configurerRecuperation(): Promise<string> {
    const crypto = this.matrix.client.getCrypto();
    if (!crypto) throw new Error('crypto-indisponible');

    const cle = await crypto.createRecoveryKeyFromPassphrase();
    await crypto.bootstrapCrossSigning({
      authUploadDeviceSigningKeys: async (requete) => {
        await requete(null);
      },
    });
    await crypto.bootstrapSecretStorage({
      createSecretStorageKey: async () => cle,
      setupNewSecretStorage: true,
      setupNewKeyBackup: true,
    });
    await this.rafraichir();
    if (!cle.encodedPrivateKey) throw new Error('cle-non-generee');
    return cle.encodedPrivateKey;
  }

  /**
   * NOUVEL APPAREIL d'un agent qui a déjà une clé de récupération : la clé saisie
   * déverrouille le stockage secret, cet appareil est signé par la clé maîtresse
   * (il devient « vérifié ») et l'historique autorisé est restauré depuis la sauvegarde.
   */
  async deverrouiller(cleSaisie: string): Promise<void> {
    const crypto = this.matrix.client.getCrypto();
    if (!crypto) throw new Error('crypto-indisponible');
    let cle: Uint8Array<ArrayBuffer>;
    try {
      cle = decodeRecoveryKey(cleSaisie.trim());
    } catch {
      throw new Error('cle-invalide');
    }
    this.cleCandidate = cle;
    try {
      const idParDefaut = await this.matrix.client.secretStorage.getDefaultKeyId();
      const infos = idParDefaut ? await this.matrix.client.secretStorage.getKey(idParDefaut) : null;
      if (!infos || !(await this.cleCorrespond(cle, infos[1]))) throw new Error('cle-invalide');

      // Récupère les clés de signature croisée depuis le stockage secret et signe cet appareil.
      await crypto.bootstrapCrossSigning({});
      // Récupère la clé de sauvegarde et relit l'historique des clés de salon.
      await crypto.loadSessionBackupPrivateKeyFromSecretStorage();
      await crypto.checkKeyBackupAndEnable();
      await crypto.restoreKeyBackup().catch(() => undefined);
    } finally {
      this.cleCandidate = null;
      await this.rafraichir();
    }
  }

  /** Appareils de l'agent (liste Synapse) avec leur statut de vérification. */
  async appareils(): Promise<AppareilAffiche[]> {
    const client = this.matrix.client;
    const crypto = client.getCrypto();
    const userId = client.getSafeUserId();
    const courant = client.getDeviceId();
    const { devices } = await client.getDevices();
    const resultat = await Promise.all(
      devices.map(async (d) => {
        const statut = crypto ? await crypto.getDeviceVerificationStatus(userId, d.device_id).catch(() => null) : null;
        return {
          deviceId: d.device_id,
          nom: d.display_name || d.device_id,
          derniereActivite: d.last_seen_ts ?? null,
          courant: d.device_id === courant,
          verifie: statut ? statut.crossSigningVerified : null,
        } satisfies AppareilAffiche;
      }),
    );
    return resultat.sort((a, b) => Number(b.courant) - Number(a.courant) || (b.derniereActivite ?? 0) - (a.derniereActivite ?? 0));
  }

  /** Un autre agent a-t-il tous ses appareils vérifiés (signature croisée) ? */
  async agentVerifie(userId: string): Promise<boolean | null> {
    const crypto = this.matrix.client.getCrypto();
    if (!crypto) return null;
    try {
      const statut = await crypto.getUserVerificationStatus(userId);
      return statut.isCrossSigningVerified();
    } catch {
      return null;
    }
  }

  oublier(): void {
    this.clesEnMemoire.clear();
    this.cleCandidate = null;
    this.etat.set(null);
  }

  private async cleCorrespond(cle: Uint8Array<ArrayBuffer>, info: SecretStorageKeyDescription): Promise<boolean> {
    try {
      return await this.matrix.client.secretStorage.checkKey(cle, info);
    } catch {
      return false;
    }
  }
}

/** Empreinte Ed25519 groupée par 4 caractères, comme dans les autres clients Matrix. */
function formaterEmpreinte(base64: string): string {
  return base64.replace(/(.{4})/g, '$1 ').trim();
}
