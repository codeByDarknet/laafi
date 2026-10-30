/**
 * Empreinte d'une instruction de service (accusé de lecture probant, contrat §4 POST /accuses).
 *
 * Principe expliqué au jury :
 *  1. le message est déchiffré LOCALEMENT (Megolm) ; le serveur ne l'a jamais en clair ;
 *  2. le client sérialise le contenu déchiffré de façon CANONIQUE (même entrée → mêmes octets,
 *     quel que soit l'ordre des clés) : JSON canonique de Matrix, clés triées, sans espaces ;
 *  3. il en calcule le SHA-256 avec WebCrypto (primitive standard du navigateur, aucune
 *     cryptographie maison) et n'envoie au backend QUE cette empreinte.
 *
 * Plus tard, n'importe qui disposant du message (l'émetteur, un juge) peut recalculer
 * l'empreinte et la comparer à celle enregistrée et signée dans le journal probant :
 * cela prouve QUEL contenu exact a été reconnu, sans que le serveur l'ait jamais lu.
 */

/**
 * JSON canonique (spécification Matrix « canonical JSON ») :
 * clés d'objets triées par ordre des points de code, aucun espace, UTF-8.
 * Les nombres non entiers et les valeurs non JSON (undefined, fonctions) sont refusés
 * pour garantir un résultat identique sur tous les clients.
 */
export function jsonCanonique(valeur: unknown): string {
  if (valeur === null) return 'null';
  switch (typeof valeur) {
    case 'boolean':
      return valeur ? 'true' : 'false';
    case 'number':
      if (!Number.isSafeInteger(valeur)) {
        throw new Error('JSON canonique : seuls les entiers sont autorisés');
      }
      return String(valeur);
    case 'string':
      return JSON.stringify(valeur);
    case 'object': {
      if (Array.isArray(valeur)) return `[${valeur.map(jsonCanonique).join(',')}]`;
      const objet = valeur as Record<string, unknown>;
      const cles = Object.keys(objet)
        .filter((k) => objet[k] !== undefined)
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      return `{${cles.map((k) => `${JSON.stringify(k)}:${jsonCanonique(objet[k])}`).join(',')}}`;
    }
    default:
      throw new Error(`JSON canonique : type non sérialisable (${typeof valeur})`);
  }
}

/** SHA-256 en hexadécimal minuscule (64 caractères), via l'API standard WebCrypto. */
export async function sha256Hex(texte: string): Promise<string> {
  const octets = new TextEncoder().encode(texte);
  const condensat = await crypto.subtle.digest('SHA-256', octets);
  return Array.from(new Uint8Array(condensat), (o) => o.toString(16).padStart(2, '0')).join('');
}

/**
 * Empreinte probante du contenu DÉCHIFFRÉ d'une instruction.
 * Les métadonnées locales ajoutées par le SDK (relations d'édition, `m.new_content`)
 * ne font pas partie du message reconnu et sont exclues.
 */
export async function empreinteInstruction(contenuDechiffre: Record<string, unknown>): Promise<string> {
  const { ['m.relates_to']: _rel, ['m.new_content']: _new, ...contenu } = contenuDechiffre;
  return sha256Hex(jsonCanonique(contenu));
}
