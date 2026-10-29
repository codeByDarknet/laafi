package bf.gov.laafi.agents;

import java.time.Instant;
import java.util.List;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** Objets échangés par l'API des agents (regroupés ici pour la lisibilité). */
public final class Dtos {

    private Dtos() {
    }

    public record AgentResume(
            String username, String matrixId, String prenom, String nom, String nomComplet, String email,
            String ministere, String direction, String fonction, String matricule,
            StatutAgent statut, boolean enrole, Instant creeLe) {
    }

    public record Appareil(String deviceId, String nom, Instant derniereActivite) {
    }

    public record AgentDetail(AgentResume agent, List<String> roles, List<Appareil> appareils) {
    }

    public record EntreeAnnuaire(String matrixId, String username, String nom, String ministere, String direction,
            String fonction) {
    }

    public record EnrolementRequete(
            @Size(min = 2, max = 64) @Pattern(regexp = "^[a-z0-9][a-z0-9._-]+$",
                    message = "minuscules, chiffres, '.', '_' ou '-' uniquement") String username,
            @NotBlank @Size(max = 100) String prenom,
            @NotBlank @Size(max = 100) String nom,
            @Email @Size(max = 255) String email,
            @Size(max = 32) String ministere,
            @Size(max = 255) String direction,
            @NotBlank @Size(max = 255) String fonction,
            @NotBlank @Size(max = 64) String matricule,
            List<String> roles) {
    }

    public record EnrolementReponse(String username, String matrixId, String motDePasseTemporaire) {
    }

    public record RevocationRequete(@NotBlank(message = "le motif est obligatoire") @Size(max = 1000) String motif) {
    }

    public record MotifOptionnel(@Size(max = 1000) String motif) {
    }

    public record ResultatOperation(String username, String matrixId, StatutAgent statut, Integer appareilsSupprimes,
            String message) {
    }
}
