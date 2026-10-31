package bf.gov.laafi.accuses;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Journal probant chaîné et signé (principe d'une « blockchain » minimale, sans consensus) :
 *
 *   serialisation = "laafi-accuse-v1|id|room_id|event_id|agent|empreinte|horodatage|hash_precedent"
 *   hash_entree   = SHA-256(serialisation)                  (JCA MessageDigest)
 *   signature     = Ed25519(hash_entree) avec la clé serveur  (JCA Signature)
 *   hash_precedent de l'entrée n = hash_entree de l'entrée n-1 (64 zéros pour la toute première)
 *
 * Conséquences :
 *  - modifier une entrée change son hash → sa signature ne correspond plus et le lien avec la suivante casse ;
 *  - supprimer ou insérer une entrée casse aussi le chaînage ;
 *  - pour falsifier sans être détecté, il faudrait la clé privée (stockée hors base, voir CleSignature).
 */
@Service
public class JournalProbant {

    public static final String HASH_ORIGINE = "0".repeat(64);
    private static final String VERSION = "laafi-accuse-v1";

    private final AccuseLectureRepository repository;
    private final CleSignature cle;
    private final TransactionTemplate transaction;

    public JournalProbant(AccuseLectureRepository repository, CleSignature cle, PlatformTransactionManager tm) {
        this.repository = repository;
        this.cle = cle;
        this.transaction = new TransactionTemplate(tm);
    }

    /** Sérialisation canonique : ordre des champs fixe, séparateur "|" (interdit dans les champs, cf. validation). */
    public static String serialisationCanonique(AccuseLecture a) {
        return String.join("|", VERSION, String.valueOf(a.getId()), a.getRoomId(), a.getEventId(), a.getAgent(),
                a.getEmpreinte(), a.getHorodatage().toString(), a.getHashPrecedent());
    }

    public static String sha256Hex(String texte) {
        try {
            byte[] h = MessageDigest.getInstance("SHA-256").digest(texte.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(h);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    /**
     * Ajoute une entrée en fin de chaîne. "synchronized" + transaction englobée : deux accusés simultanés ne
     * peuvent pas prendre le même prédécesseur. En plus, la base impose l'unicité de hash_precedent
     * (garde-fou si plusieurs instances du backend tournaient en parallèle).
     */
    public synchronized AccuseLecture ajouter(String roomId, String eventId, String agent, String empreinte) {
        return transaction.execute(statut -> {
            Optional<AccuseLecture> existant = repository.findByEventIdAndAgent(eventId, agent);
            if (existant.isPresent()) {
                return existant.get(); // idempotent : un agent n'accuse réception qu'une fois d'une instruction
            }
            Optional<AccuseLecture> dernier = repository.findTopByOrderByIdDesc();
            long id = dernier.map(d -> d.getId() + 1).orElse(1L);
            String precedent = dernier.map(AccuseLecture::getHashEntree).orElse(HASH_ORIGINE);
            // Horodatage SERVEUR, tronqué à la milliseconde pour être relu à l'identique depuis la base.
            Instant maintenant = Instant.now().truncatedTo(ChronoUnit.MILLIS);

            AccuseLecture entree = new AccuseLecture(id, roomId, eventId, agent, empreinte, maintenant, precedent);
            String hash = sha256Hex(serialisationCanonique(entree));
            entree.sceller(hash, cle.signer(hash));
            return repository.save(entree);
        });
    }

    public Optional<AccuseLecture> trouver(long id) {
        return repository.findById(id);
    }

    public List<AccuseLecture> parEvenement(String eventId) {
        return repository.findByEventIdOrderByIdAsc(eventId);
    }

    public Preuve preuve(AccuseLecture a) {
        String serialisation = serialisationCanonique(a);
        boolean valide = sha256Hex(serialisation).equals(a.getHashEntree())
                && cle.verifier(a.getHashEntree(), a.getSignature());
        return new Preuve(
                new Preuve.Entree(a.getId(), a.getRoomId(), a.getEventId(), a.getAgent(), a.getEmpreinte(),
                        a.getHorodatage()),
                serialisation, a.getHashPrecedent(), a.getHashEntree(), a.getSignature(),
                CleSignature.ALGORITHME, cle.clePubliqueBase64(), valide,
                "hash_entree = SHA-256(serialisationCanonique) ; signature = Ed25519(hash_entree en UTF-8) ; "
                        + "clePublique = X.509 SubjectPublicKeyInfo base64");
    }

    /** Parcourt toute la chaîne dans l'ordre et s'arrête à la première anomalie. */
    public RapportVerification verifierChaine() {
        List<AccuseLecture> entrees = repository.findAllByOrderByIdAsc();
        String attendu = HASH_ORIGINE;
        long numeroAttendu = 1;
        for (AccuseLecture a : entrees) {
            if (a.getId() != numeroAttendu) {
                return RapportVerification.anomalie(entrees.size(), a.getId(), "Numérotation discontinue (entrée supprimée ?)");
            }
            if (!a.getHashPrecedent().equals(attendu)) {
                return RapportVerification.anomalie(entrees.size(), a.getId(), "Chaînage rompu : hash_precedent incorrect");
            }
            if (!sha256Hex(serialisationCanonique(a)).equals(a.getHashEntree())) {
                return RapportVerification.anomalie(entrees.size(), a.getId(), "Contenu modifié : hash_entree ne correspond plus");
            }
            if (!cle.verifier(a.getHashEntree(), a.getSignature())) {
                return RapportVerification.anomalie(entrees.size(), a.getId(), "Signature Ed25519 invalide");
            }
            attendu = a.getHashEntree();
            numeroAttendu++;
        }
        return RapportVerification.ok(entrees.size(), entrees.isEmpty() ? HASH_ORIGINE : attendu);
    }
}
