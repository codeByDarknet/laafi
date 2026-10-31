package bf.gov.laafi.moi;

import java.util.List;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import bf.gov.laafi.agents.AgentService;
import bf.gov.laafi.agents.Dtos.ResultatOperation;
import bf.gov.laafi.securite.Roles;
import bf.gov.laafi.securite.UtilisateurCourant;
import bf.gov.laafi.synapse.SynapseAdminClient;

@RestController
@RequestMapping("/api/v1/me")
public class MoiController {

    public record Profil(String username, String matrixId, String nom, String prenom, String nomFamille,
            String ministere, String direction, String fonction, String matricule, List<String> roles) {
    }

    private final SynapseAdminClient synapse;
    private final AgentService agents;

    public MoiController(SynapseAdminClient synapse, AgentService agents) {
        this.synapse = synapse;
        this.agents = agents;
    }

    /** Profil construit uniquement à partir du JWT (aucun appel réseau). */
    @GetMapping
    @PreAuthorize(Roles.EST_AGENT)
    public Profil moi(JwtAuthenticationToken auth) {
        UtilisateurCourant u = UtilisateurCourant.depuis(auth);
        String nom = ((u.prenom() == null ? "" : u.prenom()) + " " + (u.nom() == null ? "" : u.nom())).trim();
        return new Profil(u.username(), synapse.matrixId(u.username()), nom, u.prenom(), u.nom(), u.ministere(),
                u.direction(), u.fonction(), u.matricule(), u.roles().stream().sorted().toList());
    }

    @PostMapping("/urgence")
    @PreAuthorize(Roles.EST_AGENT)
    public ResultatOperation urgence(JwtAuthenticationToken auth) {
        return agents.urgence(UtilisateurCourant.depuis(auth));
    }
}
