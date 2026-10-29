package bf.gov.laafi.accuses;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import bf.gov.laafi.config.LaafiProperties;

/**
 * Paire de clés Ed25519 du serveur, utilisée pour SIGNER les entrées du journal probant.
 *
 * - Algorithme : Ed25519, fourni par la JCA standard de Java (KeyPairGenerator "Ed25519"), aucune crypto maison.
 * - Usage : intégrité/authenticité du journal uniquement, jamais la confidentialité des messages (Olm/Megolm).
 * - Persistance (choix documenté) : fichiers dans un VOLUME dédié (laafi.journal.repertoire-cles), et non en base.
 *   Ainsi, quelqu'un qui obtient une copie de la base de données ne peut pas forger de nouvelles signatures :
 *   les données (base) et la clé (volume, droits 600, utilisateur non-root) sont séparées.
 *   Fichiers : journal-ed25519.key (PKCS#8, base64) et journal-ed25519.pub (X.509 SubjectPublicKeyInfo, base64).
 * - Si aucune clé n'existe au démarrage, elle est générée une seule fois puis réutilisée.
 */
@Component
public class CleSignature {

    private static final Logger LOG = LoggerFactory.getLogger(CleSignature.class);
    public static final String ALGORITHME = "Ed25519";

    private final KeyPair paire;

    public CleSignature(LaafiProperties props) throws IOException, GeneralSecurityException {
        this.paire = chargerOuGenerer(Path.of(props.journal().repertoireCles()));
    }

    private static KeyPair chargerOuGenerer(Path repertoire) throws IOException, GeneralSecurityException {
        Path privee = repertoire.resolve("journal-ed25519.key");
        Path publique = repertoire.resolve("journal-ed25519.pub");
        KeyFactory kf = KeyFactory.getInstance(ALGORITHME);
        if (Files.exists(privee) && Files.exists(publique)) {
            PrivateKey sk = kf.generatePrivate(new PKCS8EncodedKeySpec(lireBase64(privee)));
            PublicKey pk = kf.generatePublic(new X509EncodedKeySpec(lireBase64(publique)));
            return new KeyPair(pk, sk);
        }
        LOG.info("Aucune clé de journal trouvée : génération d'une nouvelle paire Ed25519");
        KeyPair kp = KeyPairGenerator.getInstance(ALGORITHME).generateKeyPair();
        Files.createDirectories(repertoire);
        Files.writeString(privee, Base64.getEncoder().encodeToString(kp.getPrivate().getEncoded()));
        Files.writeString(publique, Base64.getEncoder().encodeToString(kp.getPublic().getEncoded()));
        try {
            Files.setPosixFilePermissions(privee, PosixFilePermissions.fromString("rw-------"));
        } catch (UnsupportedOperationException e) {
            LOG.warn("Système de fichiers non POSIX : droits de la clé privée non restreints");
        }
        return kp;
    }

    private static byte[] lireBase64(Path p) throws IOException {
        return Base64.getDecoder().decode(Files.readString(p).trim());
    }

    /** Signe le texte (UTF-8) et renvoie la signature en base64 (64 octets bruts). */
    public String signer(String texte) {
        try {
            Signature s = Signature.getInstance(ALGORITHME);
            s.initSign(paire.getPrivate());
            s.update(texte.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(s.sign());
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Signature Ed25519 impossible", e);
        }
    }

    public boolean verifier(String texte, String signatureBase64) {
        return verifier(paire.getPublic(), texte, signatureBase64);
    }

    /** Vérification avec une clé publique donnée : c'est ce que ferait un tiers (juge, auditeur) avec la preuve. */
    public static boolean verifier(PublicKey cle, String texte, String signatureBase64) {
        try {
            Signature s = Signature.getInstance(ALGORITHME);
            s.initVerify(cle);
            s.update(texte.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            return s.verify(Base64.getDecoder().decode(signatureBase64));
        } catch (GeneralSecurityException | IllegalArgumentException e) {
            return false;
        }
    }

    /** Clé publique encodée X.509 (SubjectPublicKeyInfo) en base64, publiée dans chaque preuve. */
    public String clePubliqueBase64() {
        return Base64.getEncoder().encodeToString(paire.getPublic().getEncoded());
    }
}
