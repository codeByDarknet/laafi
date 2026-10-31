package bf.gov.laafi.accuses;

import java.time.Instant;

/** Résultat de la vérification d'intégrité de toute la chaîne. */
public record RapportVerification(
        boolean integre,
        int nombreEntrees,
        Long premiereEntreeInvalide,
        String raison,
        String dernierHash,
        Instant verifieLe) {

    static RapportVerification ok(int n, String dernierHash) {
        return new RapportVerification(true, n, null, null, dernierHash, Instant.now());
    }

    static RapportVerification anomalie(int n, long id, String raison) {
        return new RapportVerification(false, n, id, raison, null, Instant.now());
    }
}
