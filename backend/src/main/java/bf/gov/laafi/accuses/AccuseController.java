package bf.gov.laafi.accuses;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import bf.gov.laafi.securite.Roles;
import bf.gov.laafi.securite.UtilisateurCourant;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/v1")
public class AccuseController {

    private final AccuseService service;
    private final JournalProbant journal;

    public AccuseController(AccuseService service, JournalProbant journal) {
        this.service = service;
        this.journal = journal;
    }

    @PostMapping("/accuses")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(Roles.EST_AGENT)
    public Preuve accuser(@Valid @RequestBody AccuseRequete req, JwtAuthenticationToken auth) {
        return service.accuserReception(UtilisateurCourant.depuis(auth), req);
    }

    @GetMapping("/accuses")
    @PreAuthorize(Roles.EST_AGENT)
    public List<Preuve.Entree> lister(@RequestParam String eventId, JwtAuthenticationToken auth) {
        return service.lister(UtilisateurCourant.depuis(auth), eventId);
    }

    @GetMapping("/accuses/{id}/preuve")
    @PreAuthorize(Roles.EST_AGENT)
    public Preuve preuve(@PathVariable long id, JwtAuthenticationToken auth) {
        return service.preuve(UtilisateurCourant.depuis(auth), id);
    }

    @GetMapping("/journal/verification")
    @PreAuthorize(Roles.EST_ADMIN)
    public RapportVerification verifier() {
        return journal.verifierChaine();
    }
}
