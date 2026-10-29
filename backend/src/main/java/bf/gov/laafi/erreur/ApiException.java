package bf.gov.laafi.erreur;

import org.springframework.http.HttpStatus;

/**
 * Erreur métier renvoyée au client sous la forme JSON { "code": "...", "message": "..." }.
 * Le message est en français et ne contient jamais de secret ni de contenu de message.
 */
public class ApiException extends RuntimeException {

    private final HttpStatus statut;
    private final String code;

    public ApiException(HttpStatus statut, String code, String message) {
        super(message);
        this.statut = statut;
        this.code = code;
    }

    public HttpStatus getStatut() {
        return statut;
    }

    public String getCode() {
        return code;
    }

    public static ApiException introuvable(String code, String message) {
        return new ApiException(HttpStatus.NOT_FOUND, code, message);
    }

    public static ApiException interdit(String code, String message) {
        return new ApiException(HttpStatus.FORBIDDEN, code, message);
    }

    public static ApiException invalide(String code, String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, code, message);
    }

    public static ApiException conflit(String code, String message) {
        return new ApiException(HttpStatus.CONFLICT, code, message);
    }

    public static ApiException serviceIndisponible(String message) {
        return new ApiException(HttpStatus.BAD_GATEWAY, "SERVICE_INDISPONIBLE", message);
    }
}
