package bf.gov.laafi.erreur;

import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/** Traduit toutes les exceptions en JSON { code, message } en français. */
@RestControllerAdvice
public class GestionnaireErreurs {

    private static final Logger LOG = LoggerFactory.getLogger(GestionnaireErreurs.class);

    @ExceptionHandler(ApiException.class)
    ResponseEntity<ErreurApi> metier(ApiException e) {
        return ResponseEntity.status(e.getStatut()).body(new ErreurApi(e.getCode(), e.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ErreurApi> validation(MethodArgumentNotValidException e) {
        String detail = e.getBindingResult().getFieldErrors().stream()
                .map(f -> f.getField() + " : " + f.getDefaultMessage())
                .collect(Collectors.joining(" ; "));
        return ResponseEntity.badRequest().body(new ErreurApi("VALIDATION", "Requête invalide. " + detail));
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, MissingServletRequestParameterException.class,
            MethodArgumentTypeMismatchException.class})
    ResponseEntity<ErreurApi> requeteIllisible(Exception e) {
        return ResponseEntity.badRequest().body(new ErreurApi("REQUETE_INVALIDE", "Requête mal formée ou paramètre manquant."));
    }

    /** Refus levé par @PreAuthorize (rôle insuffisant). */
    @ExceptionHandler(AccessDeniedException.class)
    ResponseEntity<ErreurApi> accesRefuse(AccessDeniedException e) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(new ErreurApi("ACCES_REFUSE", "Vous n'avez pas les droits nécessaires pour cette action."));
    }

    @ExceptionHandler(AuthenticationException.class)
    ResponseEntity<ErreurApi> nonAuthentifie(AuthenticationException e) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(new ErreurApi("NON_AUTHENTIFIE", "Authentification requise."));
    }

    @ExceptionHandler(NoResourceFoundException.class)
    ResponseEntity<ErreurApi> ressourceInconnue(NoResourceFoundException e) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(new ErreurApi("INTROUVABLE", "Ressource introuvable."));
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    ResponseEntity<ErreurApi> methode(HttpRequestMethodNotSupportedException e) {
        return ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED)
                .body(new ErreurApi("METHODE_NON_AUTORISEE", "Méthode HTTP non prise en charge."));
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<ErreurApi> conflitDonnees(DataIntegrityViolationException e) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(new ErreurApi("CONFLIT", "L'opération entre en conflit avec des données existantes."));
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ErreurApi> inattendue(Exception e) {
        // On journalise la pile côté serveur, mais on ne renvoie aucun détail technique au client.
        LOG.error("Erreur interne non gérée", e);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(new ErreurApi("ERREUR_INTERNE", "Une erreur interne est survenue."));
    }
}
