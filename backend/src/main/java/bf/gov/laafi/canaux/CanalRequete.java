package bf.gov.laafi.canaux;

import bf.gov.laafi.politiques.Classification;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record CanalRequete(
        @NotBlank @Size(max = 255) @Pattern(regexp = "^![^|\\s]+:[^|\\s]+$", message = "identifiant de salon Matrix invalide")
        String roomId,
        @NotBlank @Size(max = 255) String nom,
        @Size(max = 32) String ministere,
        @Size(max = 1000) String description,
        Classification classification) {
}
