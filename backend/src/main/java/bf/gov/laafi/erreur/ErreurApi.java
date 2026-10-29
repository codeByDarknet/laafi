package bf.gov.laafi.erreur;

/** Corps JSON de toutes les erreurs de l'API (contrat §4). */
public record ErreurApi(String code, String message) {
}
