package bf.gov.laafi;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.anyUrl;
import static com.github.tomakehurst.wiremock.client.WireMock.deleteRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.matchingJsonPath;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.putRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

import com.github.tomakehurst.wiremock.client.WireMock;

/** Enrôlement : création Keycloak (2FA + mot de passe temporaire) puis pré-création Synapse liée par external_ids. */
class EnrolementTest extends TestBase {

    private static final String USERS = "/auth/admin/realms/laafi/users";
    private static final String MXID = "@salif.ouedraogo:laafi.local";
    private static final String MXID_URL = "%40salif.ouedraogo%3Alaafi.local";

    @BeforeEach
    void stubs() {
        stubUtilisateurAbsent("salif.ouedraogo");
        WM.stubFor(WireMock.post(urlPathEqualTo(USERS))
                .willReturn(aResponse().withStatus(201)
                        .withHeader("Location", WM.baseUrl() + USERS + "/kc-salif")));
        WM.stubFor(WireMock.get(urlPathEqualTo("/auth/admin/realms/laafi/roles/agent"))
                .willReturn(okJson("{\"id\":\"r1\",\"name\":\"agent\"}")));
        WM.stubFor(WireMock.get(urlPathEqualTo("/auth/admin/realms/laafi/roles/chef_service"))
                .willReturn(okJson("{\"id\":\"r2\",\"name\":\"chef_service\"}")));
        stubOk(WireMock.post(urlPathEqualTo(USERS + "/kc-salif/role-mappings/realm")));
        stubOk(WireMock.delete(urlPathEqualTo(USERS + "/kc-salif")));
    }

    private org.springframework.test.web.servlet.ResultActions enroler(String jeton, String ministere, String roles)
            throws Exception {
        String corps = """
                {"prenom":"Salif","nom":"Ouédraogo","email":"salif.ouedraogo@exemple.test","ministere":"%s",
                 "direction":"DRH","fonction":"Infirmier","matricule":"MSHP-0042","roles":%s}"""
                .formatted(ministere, roles);
        return mvc.perform(post("/api/v1/agents").header(HttpHeaders.AUTHORIZATION, bearer(jeton))
                .contentType(MediaType.APPLICATION_JSON).content(corps));
    }

    @Test
    @DisplayName("Enrôlement dans son ministère : Keycloak (enrole, TOTP, mdp temporaire) + Synapse (external_ids)")
    void enrolementComplet() throws Exception {
        stubOk(WireMock.put(urlPathEqualTo("/_synapse/admin/v2/users/" + MXID_URL)));

        enroler(ADMIN_SANTE, "MSHP", "[\"chef_service\"]")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.username").value("salif.ouedraogo"))
                .andExpect(jsonPath("$.matrixId").value(MXID))
                .andExpect(jsonPath("$.motDePasseTemporaire").isString());

        WM.verify(postRequestedFor(urlPathEqualTo(USERS))
                .withRequestBody(matchingJsonPath("$.attributes.enrole[0]", equalTo("true")))
                .withRequestBody(matchingJsonPath("$.attributes.ministere[0]", equalTo("MSHP")))
                .withRequestBody(matchingJsonPath("$.credentials[0].temporary", equalTo("true")))
                .withRequestBody(matchingJsonPath("$.requiredActions[?(@ == 'CONFIGURE_TOTP')]"))
                .withRequestBody(matchingJsonPath("$.requiredActions[?(@ == 'UPDATE_PASSWORD')]")));
        WM.verify(postRequestedFor(urlPathEqualTo(USERS + "/kc-salif/role-mappings/realm"))
                .withRequestBody(matchingJsonPath("$[?(@.name == 'agent')]"))
                .withRequestBody(matchingJsonPath("$[?(@.name == 'chef_service')]")));
        WM.verify(putRequestedFor(urlPathEqualTo("/_synapse/admin/v2/users/" + MXID_URL))
                .withRequestBody(matchingJsonPath("$.external_ids[0].auth_provider", equalTo("oidc-keycloak")))
                .withRequestBody(matchingJsonPath("$.external_ids[0].external_id", equalTo("kc-salif"))));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM evenement_audit WHERE action='ENROLEMENT' AND cible='salif.ouedraogo'",
                Integer.class)).isEqualTo(1);
    }

    @Test
    @DisplayName("Un admin MSHP ne peut pas enrôler dans un autre ministère")
    void enrolementHorsPerimetre() throws Exception {
        enroler(ADMIN_SANTE, "MEF", "[]")
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("HORS_PERIMETRE"));
        WM.verify(0, postRequestedFor(urlPathEqualTo(USERS)));
    }

    @Test
    @DisplayName("Un admin_ministere ne peut pas attribuer le rôle admin_ministere ni super_admin")
    void escaladeDeRolesInterdite() throws Exception {
        enroler(ADMIN_SANTE, "MSHP", "[\"admin_ministere\"]")
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("ROLE_NON_AUTORISE"));
        enroler(SUPER_ADMIN, "MSHP", "[\"super_admin\"]")
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("ROLE_NON_AUTORISE"));
        WM.verify(0, postRequestedFor(urlPathEqualTo(USERS)));
    }

    @Test
    @DisplayName("Ministère inconnu refusé")
    void ministereInconnu() throws Exception {
        enroler(SUPER_ADMIN, "XYZ", "[]")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("MINISTERE_INCONNU"));
    }

    @Test
    @DisplayName("Échec Synapse : le compte Keycloak créé est supprimé (compensation)")
    void compensationSiSynapseEchoue() throws Exception {
        WM.stubFor(WireMock.put(urlPathEqualTo("/_synapse/admin/v2/users/" + MXID_URL))
                .willReturn(aResponse().withStatus(500)));
        enroler(ADMIN_SANTE, "MSHP", "[]")
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.code").value("SERVICE_INDISPONIBLE"));
        WM.verify(deleteRequestedFor(urlPathEqualTo(USERS + "/kc-salif")));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM evenement_audit", Integer.class)).isZero();
    }

    @Test
    @DisplayName("Identifiant déjà pris : 409, rien n'est créé")
    void doublon() throws Exception {
        stubUtilisateur("kc-x", "salif.ouedraogo", "MSHP", "agent");
        enroler(ADMIN_SANTE, "MSHP", "[]")
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("AGENT_EXISTANT"));
        WM.verify(0, postRequestedFor(urlPathEqualTo(USERS)));
        WM.verify(0, putRequestedFor(anyUrl()));
    }
}
