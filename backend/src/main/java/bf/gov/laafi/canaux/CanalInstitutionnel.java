package bf.gov.laafi.canaux;

import java.time.Instant;

import bf.gov.laafi.politiques.Classification;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Registre des canaux institutionnels : uniquement des MÉTADONNÉES (le salon Matrix chiffré est créé par
 * le client ; le backend n'en connaît que l'identifiant, le nom et la classification déclarés).
 */
@Entity
@Table(name = "canal_institutionnel")
public class CanalInstitutionnel {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "room_id", nullable = false, unique = true)
    private String roomId;

    @Column(nullable = false)
    private String nom;

    @Column(nullable = false, length = 32)
    private String ministere;

    @Column(length = 1000)
    private String description;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private Classification classification;

    @Column(name = "cree_par", nullable = false)
    private String creePar;

    @Column(name = "cree_le", nullable = false)
    private Instant creeLe;

    protected CanalInstitutionnel() {
    }

    public CanalInstitutionnel(String roomId, String nom, String ministere, String description,
            Classification classification, String creePar, Instant creeLe) {
        this.roomId = roomId;
        this.nom = nom;
        this.ministere = ministere;
        this.description = description;
        this.classification = classification;
        this.creePar = creePar;
        this.creeLe = creeLe;
    }

    public Long getId() {
        return id;
    }

    public String getRoomId() {
        return roomId;
    }

    public String getNom() {
        return nom;
    }

    public String getMinistere() {
        return ministere;
    }

    public String getDescription() {
        return description;
    }

    public Classification getClassification() {
        return classification;
    }

    public String getCreePar() {
        return creePar;
    }

    public Instant getCreeLe() {
        return creeLe;
    }
}
