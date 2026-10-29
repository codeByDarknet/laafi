package bf.gov.laafi.audit;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Événement du journal d'audit administratif : QUI a fait QUOI sur QUI, QUAND et POURQUOI.
 * Par conception, aucune colonne ne peut recevoir de contenu de message.
 */
@Entity
@Table(name = "evenement_audit")
public class EvenementAudit {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Instant horodatage;

    @Column(nullable = false)
    private String acteur;

    @Column(nullable = false, length = 64)
    private String action;

    private String cible;

    /** Ministère de la cible : permet de limiter un admin_ministere aux événements de son ministère. */
    @Column(length = 32)
    private String ministere;

    @Column(length = 1000)
    private String motif;

    protected EvenementAudit() {
    }

    public EvenementAudit(Instant horodatage, String acteur, ActionAudit action, String cible, String ministere,
            String motif) {
        this.horodatage = horodatage;
        this.acteur = acteur;
        this.action = action.name();
        this.cible = cible;
        this.ministere = ministere;
        this.motif = motif;
    }

    public Long getId() {
        return id;
    }

    public Instant getHorodatage() {
        return horodatage;
    }

    public String getActeur() {
        return acteur;
    }

    public String getAction() {
        return action;
    }

    public String getCible() {
        return cible;
    }

    public String getMinistere() {
        return ministere;
    }

    public String getMotif() {
        return motif;
    }
}
