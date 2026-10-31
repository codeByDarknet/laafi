package bf.gov.laafi.accuses;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Entrée du journal probant des accusés de lecture.
 * Chaque entrée contient l'empreinte de l'entrée précédente (hash_precedent) : modifier ou supprimer une
 * entrée ancienne casse la chaîne pour toutes les suivantes, ce qui est détecté par la vérification.
 * L'id est un numéro de séquence attribué par le service (1, 2, 3...) car il fait partie des données hachées.
 */
@Entity
@Table(name = "accuse_lecture")
public class AccuseLecture {

    @Id
    private Long id;

    @Column(name = "room_id", nullable = false)
    private String roomId;

    @Column(name = "event_id", nullable = false)
    private String eventId;

    /** username (localpart Matrix) de l'agent qui accuse réception. */
    @Column(nullable = false)
    private String agent;

    /** SHA-256 hex du contenu déchiffré canonique, calculé PAR LE CLIENT : le serveur ne voit jamais le contenu. */
    @Column(nullable = false, length = 64)
    private String empreinte;

    @Column(nullable = false)
    private Instant horodatage;

    @Column(name = "hash_precedent", nullable = false, length = 64)
    private String hashPrecedent;

    @Column(name = "hash_entree", nullable = false, length = 64)
    private String hashEntree;

    /** Signature Ed25519 (base64) de hash_entree. */
    @Column(nullable = false, length = 128)
    private String signature;

    protected AccuseLecture() {
    }

    public AccuseLecture(Long id, String roomId, String eventId, String agent, String empreinte, Instant horodatage,
            String hashPrecedent) {
        this.id = id;
        this.roomId = roomId;
        this.eventId = eventId;
        this.agent = agent;
        this.empreinte = empreinte;
        this.horodatage = horodatage;
        this.hashPrecedent = hashPrecedent;
    }

    void sceller(String hashEntree, String signature) {
        this.hashEntree = hashEntree;
        this.signature = signature;
    }

    public Long getId() {
        return id;
    }

    public String getRoomId() {
        return roomId;
    }

    public String getEventId() {
        return eventId;
    }

    public String getAgent() {
        return agent;
    }

    public String getEmpreinte() {
        return empreinte;
    }

    public Instant getHorodatage() {
        return horodatage;
    }

    public String getHashPrecedent() {
        return hashPrecedent;
    }

    public String getHashEntree() {
        return hashEntree;
    }

    public String getSignature() {
        return signature;
    }
}
