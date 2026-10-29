package bf.gov.laafi.agents;

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

import bf.gov.laafi.agents.Dtos.AgentDetail;
import bf.gov.laafi.agents.Dtos.AgentResume;
import bf.gov.laafi.agents.Dtos.EnrolementReponse;
import bf.gov.laafi.agents.Dtos.EnrolementRequete;
import bf.gov.laafi.agents.Dtos.EntreeAnnuaire;
import bf.gov.laafi.agents.Dtos.MotifOptionnel;
import bf.gov.laafi.agents.Dtos.ResultatOperation;
import bf.gov.laafi.agents.Dtos.RevocationRequete;
import bf.gov.laafi.commun.Page;
import bf.gov.laafi.securite.Roles;
import bf.gov.laafi.securite.UtilisateurCourant;
import jakarta.validation.Valid;

/**
 * Endpoints d'administration des agents. Deux niveaux de contrôle :
 *  1. @PreAuthorize : le RÔLE (lu dans le JWT) ;
 *  2. AgentService.verifierPerimetre : la PORTÉE (ministère de l'admin = ministère de l'agent ciblé).
 */
@RestController
@RequestMapping("/api/v1")
public class AgentController {

    private final AgentService service;

    public AgentController(AgentService service) {
        this.service = service;
    }

    @GetMapping("/annuaire")
    @PreAuthorize(Roles.EST_AGENT)
    public Page<EntreeAnnuaire> annuaire(@RequestParam(required = false) String q,
            @RequestParam(required = false) String ministere, @RequestParam(defaultValue = "0") int page) {
        return service.annuaire(q, ministere, page);
    }

    @GetMapping("/agents")
    @PreAuthorize(Roles.EST_ADMIN)
    public List<AgentResume> lister(@RequestParam(required = false) String q,
            @RequestParam(required = false) String ministere, @RequestParam(required = false) StatutAgent statut,
            JwtAuthenticationToken auth) {
        return service.lister(UtilisateurCourant.depuis(auth), q, ministere, statut);
    }

    @PostMapping("/agents")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(Roles.EST_ADMIN)
    public EnrolementReponse enroler(@Valid @RequestBody EnrolementRequete req, JwtAuthenticationToken auth) {
        return service.enroler(UtilisateurCourant.depuis(auth), req);
    }

    @GetMapping("/agents/{username}")
    @PreAuthorize(Roles.EST_ADMIN)
    public AgentDetail detail(@PathVariable String username, JwtAuthenticationToken auth) {
        return service.detail(UtilisateurCourant.depuis(auth), username);
    }

    @PostMapping("/agents/{username}/revocation")
    @PreAuthorize(Roles.EST_ADMIN)
    public ResultatOperation revoquer(@PathVariable String username, @Valid @RequestBody RevocationRequete req,
            JwtAuthenticationToken auth) {
        return service.revoquer(UtilisateurCourant.depuis(auth), username, req.motif().trim());
    }

    @PostMapping("/agents/{username}/appareils/revocation")
    @PreAuthorize(Roles.EST_ADMIN)
    public ResultatOperation revoquerAppareils(@PathVariable String username,
            @Valid @RequestBody(required = false) MotifOptionnel req, JwtAuthenticationToken auth) {
        return service.revoquerAppareils(UtilisateurCourant.depuis(auth), username, req == null ? null : req.motif());
    }

    @PostMapping("/agents/{username}/reactivation")
    @PreAuthorize(Roles.EST_SUPER_ADMIN)
    public ResultatOperation reactiver(@PathVariable String username,
            @Valid @RequestBody(required = false) MotifOptionnel req, JwtAuthenticationToken auth) {
        return service.reactiver(UtilisateurCourant.depuis(auth), username, req == null ? null : req.motif());
    }
}
