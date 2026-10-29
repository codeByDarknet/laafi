package bf.gov.laafi.agents;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Dernier statut administratif connu d'un agent (complète Keycloak, qui ne connaît que enabled=true/false :
 * le statut APPAREILS_REVOQUES n'existe que chez nous). Keycloak reste la source de vérité pour REVOQUE.
 */
@Entity
@Table(name = "etat_agent")
public class EtatAgent {

    @Id
    private String username;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private StatutAgent statut;

    @Column(name = "modifie_le", nullable = false)
    private Instant modifieLe;

    protected EtatAgent() {
    }

    public EtatAgent(String username, StatutAgent statut, Instant modifieLe) {
        this.username = username;
        this.statut = statut;
        this.modifieLe = modifieLe;
    }

    public String getUsername() {
        return username;
    }

    public StatutAgent getStatut() {
        return statut;
    }

    public Instant getModifieLe() {
        return modifieLe;
    }
}
