package bf.gov.laafi.accuses;

import java.time.Instant;

/** Preuve autoportante : un tiers peut la vérifier avec n'importe quelle bibliothèque SHA-256 + Ed25519. */
public record Preuve(
        Entree entree,
        String serialisationCanonique,
        String hashPrecedent,
        String hashEntree,
        String signature,
        String algorithme,
        String clePublique,
        boolean verifieeParLeServeur,
        String methode) {

    public record Entree(Long id, String roomId, String eventId, String agent, String empreinte, Instant horodatage) {
    }
}
