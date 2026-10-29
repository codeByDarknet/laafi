package bf.gov.laafi.politiques;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Règles appliquées par les clients selon le niveau de classification (contrat §6).
 * Ces règles sont dissuasives côté client (le web ne permet pas d'empêcher une capture d'écran) :
 * filigrane nominatif, flou hors focus, interdiction de copie/transfert, expiration.
 */
@Entity
@Table(name = "politique_classification")
public class PolitiqueClassification {

    @Id
    @Enumerated(EnumType.STRING)
    @Column(length = 32)
    private Classification niveau;

    @Column(nullable = false)
    private String libelle;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private Transfert transfert;

    @Column(nullable = false)
    private boolean copie;

    /** Durée d'expiration par défaut en jours ; null = aucune expiration. */
    @Column(name = "expiration_jours")
    private Integer expirationJours;

    @Column(nullable = false)
    private boolean filigrane;

    /** Filigrane nominatif (nom + matricule + date) plutôt qu'un simple bandeau de niveau. */
    @Column(name = "filigrane_nominatif", nullable = false)
    private boolean filigraneNominatif;

    @Column(name = "flou_hors_focus", nullable = false)
    private boolean flouHorsFocus;

    @Column(name = "modifie_par")
    private String modifiePar;

    @Column(name = "modifie_le")
    private Instant modifieLe;

    protected PolitiqueClassification() {
    }

    public void appliquer(PolitiqueRequete r, String acteur, Instant quand) {
        this.libelle = r.libelle() != null && !r.libelle().isBlank() ? r.libelle() : this.libelle;
        this.transfert = r.transfert();
        this.copie = r.copie();
        this.expirationJours = r.expirationJours();
        this.filigrane = r.filigrane();
        this.filigraneNominatif = r.filigraneNominatif();
        this.flouHorsFocus = r.flouHorsFocus();
        this.modifiePar = acteur;
        this.modifieLe = quand;
    }

    public Classification getNiveau() {
        return niveau;
    }

    public String getLibelle() {
        return libelle;
    }

    public Transfert getTransfert() {
        return transfert;
    }

    public boolean isCopie() {
        return copie;
    }

    public Integer getExpirationJours() {
        return expirationJours;
    }

    public boolean isFiligrane() {
        return filigrane;
    }

    public boolean isFiligraneNominatif() {
        return filigraneNominatif;
    }

    public boolean isFlouHorsFocus() {
        return flouHorsFocus;
    }

    public String getModifiePar() {
        return modifiePar;
    }

    public Instant getModifieLe() {
        return modifieLe;
    }
}
