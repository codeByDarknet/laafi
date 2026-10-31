package bf.gov.laafi.audit;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import bf.gov.laafi.commun.Page;
import bf.gov.laafi.securite.Roles;
import bf.gov.laafi.securite.UtilisateurCourant;

@RestController
@RequestMapping("/api/v1/audit")
public class AuditController {

    private final AuditService service;

    public AuditController(AuditService service) {
        this.service = service;
    }

    @GetMapping
    @PreAuthorize(Roles.EST_ADMIN)
    public Page<EvenementAudit> consulter(@RequestParam(defaultValue = "0") int page, JwtAuthenticationToken auth) {
        return service.consulter(UtilisateurCourant.depuis(auth), page);
    }
}
