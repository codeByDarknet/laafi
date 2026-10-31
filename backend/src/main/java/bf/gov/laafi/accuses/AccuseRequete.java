package bf.gov.laafi.accuses;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Corps de POST /accuses. Le client envoie l'EMPREINTE (SHA-256) du message déchiffré, jamais le message.
 * Les motifs interdisent le caractère "|" et les espaces, utilisés dans la sérialisation canonique.
 */
public record AccuseRequete(
        // « :serveur » facultatif : en salons Matrix v12 (version par défaut de Synapse),
        // l'identifiant est « !<empreinte> », sans nom de serveur.
        @NotBlank @Size(max = 255) @Pattern(regexp = "^![^|:\\s]+(:[^|\\s]+)?$", message = "identifiant de salon Matrix invalide")
        String roomId,
        @NotBlank @Size(max = 255) @Pattern(regexp = "^\\$[^|\\s]+$", message = "identifiant d'événement Matrix invalide")
        String eventId,
        @NotBlank @Pattern(regexp = "^[0-9a-fA-F]{64}$", message = "doit être un SHA-256 hexadécimal (64 caractères)")
        String empreinte) {
}
