import { Injectable, inject } from '@angular/core';
import { decryptAttachment, encryptAttachment } from 'matrix-encrypt-attachment';
import type { IEncryptedFile } from 'matrix-encrypt-attachment';
import { MatrixClientService } from './matrix-client.service';

/**
 * Pièces jointes chiffrées (images, documents, messages vocaux).
 *
 * Megolm chiffre le MESSAGE, mais un fichier est trop gros pour y être inclus : il est
 * téléversé à part dans le dépôt de médias de Synapse. Procédure standard de Matrix
 * (« encrypted attachments ») réalisée par la bibliothèque matrix-encrypt-attachment :
 *   1. clé AES-256 ALÉATOIRE propre à ce fichier + vecteur d'initialisation (WebCrypto) ;
 *   2. chiffrement AES-CTR, puis SHA-256 du fichier chiffré (contrôle d'intégrité) ;
 *   3. téléversement du fichier CHIFFRÉ seulement (type application/octet-stream, sans nom) ;
 *   4. la clé, l'IV et le hash voyagent DANS le message, lui-même chiffré par Megolm.
 * Le serveur stocke donc un blob opaque dont il ne connaît ni le contenu, ni le type, ni le nom.
 */

/** Description d'un fichier chiffré dans le contenu d'un message (champ `file`). */
export type FichierChiffre = IEncryptedFile & { url: string; mimetype?: string };

@Injectable({ providedIn: 'root' })
export class PiecesJointesService {
  private readonly matrix = inject(MatrixClientService);
  /** URL blob: des fichiers déchiffrés, en mémoire uniquement (révoquées à l'effacement). */
  private readonly cache = new Map<string, Promise<string>>();

  async chiffrerEtTeleverser(donnees: Blob, mimetype: string): Promise<FichierChiffre> {
    const { data, info } = await encryptAttachment(await donnees.arrayBuffer());
    const reponse = await this.matrix.client.uploadContent(new Blob([data], { type: 'application/octet-stream' }), {
      type: 'application/octet-stream',
      includeFilename: false,
    });
    return { ...info, url: reponse.content_uri, mimetype };
  }

  /** Télécharge, VÉRIFIE (SHA-256) puis déchiffre un fichier ; renvoie une URL blob: locale. */
  urlDechiffree(fichier: FichierChiffre, mimetype: string): Promise<string> {
    const cle = fichier.url;
    let promesse = this.cache.get(cle);
    if (!promesse) {
      promesse = this.telechargerEtDechiffrer(fichier, mimetype);
      this.cache.set(cle, promesse);
      promesse.catch(() => this.cache.delete(cle));
    }
    return promesse;
  }

  /** Libère toutes les URL blob: (révocation / déconnexion). */
  vider(): void {
    for (const p of this.cache.values()) {
      p.then((url) => URL.revokeObjectURL(url)).catch(() => undefined);
    }
    this.cache.clear();
  }

  private async telechargerEtDechiffrer(fichier: FichierChiffre, mimetype: string): Promise<string> {
    const client = this.matrix.client;
    // Médias authentifiés (Synapse `enable_authenticated_media`) : l'URL exige le jeton Matrix.
    const http = client.mxcUrlToHttp(fichier.url, undefined, undefined, undefined, false, true, true);
    if (!http) throw new Error('url-media-invalide');
    const reponse = await fetch(http, { headers: { Authorization: `Bearer ${client.getAccessToken()}` } });
    if (!reponse.ok) throw new Error(`telechargement-${reponse.status}`);
    // decryptAttachment refuse le fichier si son SHA-256 ne correspond pas (fichier altéré).
    const clair = await decryptAttachment(await reponse.arrayBuffer(), fichier);
    return URL.createObjectURL(new Blob([clair], { type: mimetype || 'application/octet-stream' }));
  }
}

/**
 * Compression d'image pour les réseaux lents : redimensionnement à 1600 px max et
 * réencodage JPEG 0,8 via un canvas. Effet de bord utile : les métadonnées EXIF (dont la
 * position GPS de la prise de vue) sont supprimées.
 */
export async function compresserImage(
  fichier: File,
  coteMax = 1600,
  qualite = 0.8,
): Promise<{ blob: Blob; largeur: number; hauteur: number; mimetype: string }> {
  const bitmap = await createImageBitmap(fichier);
  const echelle = Math.min(1, coteMax / Math.max(bitmap.width, bitmap.height));
  const largeur = Math.round(bitmap.width * echelle);
  const hauteur = Math.round(bitmap.height * echelle);
  const canvas = document.createElement('canvas');
  canvas.width = largeur;
  canvas.height = hauteur;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas-indisponible');
  ctx.drawImage(bitmap, 0, 0, largeur, hauteur);
  bitmap.close();
  const garderPng = fichier.type === 'image/png' && fichier.size < 300_000;
  const mimetype = garderPng ? 'image/png' : 'image/jpeg';
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('compression-echouee'))), mimetype, qualite),
  );
  return { blob, largeur, hauteur, mimetype };
}
