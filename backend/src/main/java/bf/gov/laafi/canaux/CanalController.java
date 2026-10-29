package bf.gov.laafi.canaux;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import bf.gov.laafi.audit.ActionAudit;
import bf.gov.laafi.audit.AuditService;
import bf.gov.laafi.erreur.ApiException;
import bf.gov.laafi.politiques.Classification;
import bf.gov.laafi.referentiel.ReferentielMinisteres;
import bf.gov.laafi.securite.Roles;
import bf.gov.laafi.securite.UtilisateurCourant;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/v1/canaux")
public class CanalController {

    private final CanalRepository repository;
    private final ReferentielMinisteres ministeres;
    private final AuditService audit;

    public CanalController(CanalRepository repository, ReferentielMinisteres ministeres, AuditService audit) {
        this.repository = repository;
        this.ministeres = ministeres;
        this.audit = audit;
    }

    @GetMapping
    @PreAuthorize(Roles.EST_AGENT)
    public List<CanalInstitutionnel> lister(@RequestParam(required = false) String ministere) {
        return ministere == null || ministere.isBlank()
                ? repository.findAllByOrderByMinistereAscNomAsc()
                : repository.findByMinistereOrderByNomAsc(ministere);
    }

    /**
     * Enregistre un canal. chef_service et admin_ministere : uniquement pour LEUR ministère ;
     * super_admin : pour n'importe quel ministère.
     */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(Roles.EST_CHEF_OU_PLUS)
    public CanalInstitutionnel enregistrer(@Valid @RequestBody CanalRequete req, JwtAuthenticationToken auth) {
        UtilisateurCourant u = UtilisateurCourant.depuis(auth);
        String ministere = req.ministere() == null || req.ministere().isBlank() ? u.ministere() : req.ministere();
        ministeres.verifierExiste(ministere);
        if (!u.estSuperAdmin() && !ministere.equals(u.ministere())) {
            throw ApiException.interdit("HORS_PERIMETRE", "Vous ne pouvez enregistrer un canal que pour votre ministère.");
        }
        if (repository.existsByRoomId(req.roomId())) {
            throw ApiException.conflit("CANAL_EXISTANT", "Ce salon est déjà enregistré comme canal institutionnel.");
        }
        Classification c = req.classification() == null ? Classification.NORMAL : req.classification();
        CanalInstitutionnel canal = repository.save(new CanalInstitutionnel(req.roomId(), req.nom().trim(), ministere,
                req.description(), c, u.username(), Instant.now().truncatedTo(ChronoUnit.MILLIS)));
        audit.journaliser(u.username(), ActionAudit.CANAL_ENREGISTRE, req.roomId(), ministere, null);
        return canal;
    }
}
