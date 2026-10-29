package bf.gov.laafi.politiques;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import bf.gov.laafi.audit.ActionAudit;
import bf.gov.laafi.audit.AuditService;
import bf.gov.laafi.erreur.ApiException;
import bf.gov.laafi.securite.Roles;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/v1/politiques")
public class PolitiqueController {

    private final PolitiqueRepository repository;
    private final AuditService audit;

    public PolitiqueController(PolitiqueRepository repository, AuditService audit) {
        this.repository = repository;
        this.audit = audit;
    }

    @GetMapping
    public List<PolitiqueClassification> lister() {
        return repository.findAll().stream()
                .sorted((a, b) -> a.getNiveau().compareTo(b.getNiveau()))
                .toList();
    }

    @PutMapping("/{niveau}")
    @PreAuthorize(Roles.EST_SUPER_ADMIN)
    @Transactional
    public PolitiqueClassification modifier(@PathVariable String niveau, @Valid @RequestBody PolitiqueRequete req,
            JwtAuthenticationToken auth) {
        Classification c;
        try {
            c = Classification.valueOf(niveau);
        } catch (IllegalArgumentException e) {
            throw ApiException.introuvable("NIVEAU_INCONNU", "Niveau de classification inconnu : " + niveau);
        }
        PolitiqueClassification p = repository.findById(c)
                .orElseThrow(() -> ApiException.introuvable("NIVEAU_INCONNU", "Politique introuvable."));
        p.appliquer(req, auth.getName(), Instant.now().truncatedTo(ChronoUnit.MILLIS));
        audit.journaliser(auth.getName(), ActionAudit.POLITIQUE_MODIFIEE, c.name(), null, null);
        return p;
    }
}
