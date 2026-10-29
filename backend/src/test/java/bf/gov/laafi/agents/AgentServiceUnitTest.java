package bf.gov.laafi.agents;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

import java.util.List;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import bf.gov.laafi.audit.AuditService;
import bf.gov.laafi.erreur.ApiException;
import bf.gov.laafi.keycloak.KeycloakAdminClient;
import bf.gov.laafi.keycloak.UtilisateurKeycloak;
import bf.gov.laafi.referentiel.ReferentielMinisteres;
import bf.gov.laafi.securite.UtilisateurCourant;
import bf.gov.laafi.synapse.SynapseAdminClient;

/** Tests unitaires (Mockito, sans Spring) des règles de portée et des utilitaires d'enrôlement. */
class AgentServiceUnitTest {

    private final KeycloakAdminClient keycloak = mock(KeycloakAdminClient.class);
    private final SynapseAdminClient synapse = mock(SynapseAdminClient.class);
    private final AgentService service = new AgentService(keycloak, synapse, mock(EtatAgentRepository.class),
            mock(AuditService.class), mock(ReferentielMinisteres.class));

    private static UtilisateurCourant admin(String ministere, String... roles) {
        return new UtilisateurCourant("admin", "sub", "A", "B", ministere, null, null, null, Set.of(roles));
    }

    private static UtilisateurKeycloak cible(String ministere) {
        return new UtilisateurKeycloak(Map.of("id", "x", "username", "cible",
                "attributes", Map.of("ministere", List.of(ministere))));
    }

    @Test
    @DisplayName("Portée : admin MSHP sur agent MEF refusé, sur agent MSHP accepté, super_admin partout")
    void perimetre() {
        assertThatThrownBy(() -> service.verifierPerimetre(admin("MSHP", "admin_ministere"), cible("MEF")))
                .isInstanceOf(ApiException.class).hasMessageContaining("ministère");
        service.verifierPerimetre(admin("MSHP", "admin_ministere"), cible("MSHP"));
        service.verifierPerimetre(admin("MTDPCE", "super_admin"), cible("MEF"));
        verifyNoInteractions(keycloak, synapse);
    }

    @Test
    @DisplayName("Admin de ministère sans claim ministere : aucun périmètre")
    void sansClaimMinistere() {
        assertThatThrownBy(() -> service.verifierPerimetre(admin(null, "admin_ministere"),
                new UtilisateurKeycloak(Map.of("id", "x", "username", "sans-ministere"))))
                .isInstanceOf(ApiException.class);
    }

    @Test
    @DisplayName("Identifiant dérivé du nom : accents et espaces supprimés")
    void username() {
        assertThat(AgentService.genererUsername("Rasmata", "Compaoré")).isEqualTo("rasmata.compaore");
        assertThat(AgentService.genererUsername("Jean Baptiste", "Ouédraogo")).isEqualTo("jeanbaptiste.ouedraogo");
    }

    @Test
    @DisplayName("Mot de passe temporaire : 16 caractères, 4 classes, aléatoire")
    void motDePasse() {
        String p = AgentService.motDePasseTemporaire();
        assertThat(p).hasSize(16).containsPattern("[A-Z]").containsPattern("[a-z]").containsPattern("[0-9]")
                .containsPattern("[!@#%*+-]");
        assertThat(AgentService.motDePasseTemporaire()).isNotEqualTo(p);
    }
}
