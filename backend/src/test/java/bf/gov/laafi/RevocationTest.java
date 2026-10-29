package bf.gov.laafi;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.anyRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.anyUrl;
import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.equalToJson;
import static com.github.tomakehurst.wiremock.client.WireMock.matchingJsonPath;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.putRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

import com.github.tomakehurst.wiremock.client.WireMock;

/** Révocation totale, révocation des appareils, bouton d'urgence et contrôle de portée par ministère. */
class RevocationTest extends TestBase {

    private static final String KC = "/auth/admin/realms/laafi/users/";

    @BeforeEach
    void comptes() {
        stubUtilisateur("kc-issa", "issa.kabore", "MSHP", "agent");
        stubUtilisateur("kc-paul", "paul.zongo", "MEF", "agent");
        stubUtilisateur("kc-super", "super.admin", "MTDPCE", "agent", "super_admin");
        for (String id : new String[] {"kc-issa", "kc-paul", "kc-super"}) {
            stubOk(WireMock.put(urlPathEqualTo(KC + id)));
            stubOk(WireMock.post(urlPathEqualTo(KC + id + "/logout")));
        }
        WM.stubFor(WireMock.post(WireMock.urlPathMatching("/_synapse/admin/v1/deactivate/.*"))
                .willReturn(okJson("{\"id_server_unbind_result\":\"success\"}")));
    }

    private org.springframework.test.web.servlet.ResultActions revoquer(String jeton, String username, String corps)
            throws Exception {
        return mvc.perform(post("/api/v1/agents/" + username + "/revocation")
                .header(HttpHeaders.AUTHORIZATION, bearer(jeton))
                .contentType(MediaType.APPLICATION_JSON).content(corps));
    }

    @Test
    @DisplayName("Révocation totale : Keycloak désactivé + enrole=false + logout, puis Synapse deactivate, journalisé")
    void revocationTotale() throws Exception {
        revoquer(ADMIN_SANTE, "issa.kabore", "{\"motif\":\"Départ du service\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.statut").value("REVOQUE"))
                .andExpect(jsonPath("$.matrixId").value("@issa.kabore:laafi.local"));

        WM.verify(putRequestedFor(urlPathEqualTo(KC + "kc-issa"))
                .withHeader("Authorization", equalTo("Bearer jeton-kc"))
                .withRequestBody(matchingJsonPath("$.enabled", equalTo("false")))
                .withRequestBody(matchingJsonPath("$.attributes.enrole[0]", equalTo("false")))
                // les autres attributs sont conservés
                .withRequestBody(matchingJsonPath("$.attributes.ministere[0]", equalTo("MSHP"))));
        WM.verify(postRequestedFor(urlPathEqualTo(KC + "kc-issa/logout")));
        WM.verify(postRequestedFor(urlPathEqualTo("/_synapse/admin/v1/deactivate/%40issa.kabore%3Alaafi.local"))
                .withHeader("Authorization", equalTo("Bearer jeton-synapse"))
                .withRequestBody(equalToJson("{\"erase\":false}")));

        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM evenement_audit WHERE action='REVOCATION_TOTALE' AND cible='issa.kabore' "
                        + "AND acteur='admin.sante' AND motif='Départ du service' AND ministere='MSHP'",
                Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT statut FROM etat_agent WHERE username='issa.kabore'", String.class))
                .isEqualTo("REVOQUE");
    }

    @Test
    @DisplayName("Portée : un admin MSHP ne peut PAS révoquer un agent du MEF (aucun appel de modification)")
    void porteeMinistere() throws Exception {
        revoquer(ADMIN_SANTE, "paul.zongo", "{\"motif\":\"Tentative hors périmètre\"}")
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("HORS_PERIMETRE"));

        WM.verify(0, putRequestedFor(anyUrl()));
        WM.verify(0, postRequestedFor(urlPathEqualTo(KC + "kc-paul/logout")));
        WM.verify(0, postRequestedFor(WireMock.urlPathMatching("/_synapse/admin/.*")));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM evenement_audit", Integer.class)).isZero();

        // Ni sa fiche, ni ses appareils
        mvc.perform(get("/api/v1/agents/paul.zongo").header(HttpHeaders.AUTHORIZATION, bearer(ADMIN_SANTE)))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/agents/paul.zongo/appareils/revocation")
                .header(HttpHeaders.AUTHORIZATION, bearer(ADMIN_SANTE)))
                .andExpect(status().isForbidden());
        WM.verify(0, anyRequestedFor(WireMock.urlPathMatching("/_synapse/admin/.*")));
    }

    @Test
    @DisplayName("Le super_admin peut révoquer dans tous les ministères")
    void superAdminPartout() throws Exception {
        revoquer(SUPER_ADMIN, "paul.zongo", "{\"motif\":\"Fin de contrat\"}").andExpect(status().isOk());
        WM.verify(postRequestedFor(urlPathEqualTo("/_synapse/admin/v1/deactivate/%40paul.zongo%3Alaafi.local")));
    }

    @Test
    @DisplayName("Motif obligatoire pour une révocation totale")
    void motifObligatoire() throws Exception {
        revoquer(ADMIN_SANTE, "issa.kabore", "{\"motif\":\"  \"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION"));
        WM.verify(0, putRequestedFor(anyUrl()));
    }

    @Test
    @DisplayName("Un admin ne peut pas révoquer son propre compte ; un admin_ministere ne touche pas un super_admin")
    void gardeFous() throws Exception {
        stubUtilisateur("kc-admin-sante", "admin.sante", "MSHP", "agent", "admin_ministere");
        revoquer(ADMIN_SANTE, "admin.sante", "{\"motif\":\"x\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("AUTO_REVOCATION"));
        stubUtilisateur("kc-super", "super.admin", "MSHP", "agent", "super_admin"); // même ministère, rôle supérieur
        revoquer(ADMIN_SANTE, "super.admin", "{\"motif\":\"x\"}")
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("HORS_PERIMETRE"));
        WM.verify(0, putRequestedFor(anyUrl()));
    }

    @Test
    @DisplayName("Agent inconnu : 404")
    void agentInconnu() throws Exception {
        stubUtilisateurAbsent("intrus");
        revoquer(SUPER_ADMIN, "intrus", "{\"motif\":\"x\"}")
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("AGENT_INTROUVABLE"));
    }

    @Test
    @DisplayName("Perte de téléphone : logout Keycloak + suppression de TOUS les appareils Synapse, compte conservé")
    void revocationAppareils() throws Exception {
        WM.stubFor(WireMock.get(urlPathEqualTo("/_synapse/admin/v2/users/%40issa.kabore%3Alaafi.local/devices"))
                .willReturn(okJson("{\"devices\":[{\"device_id\":\"TEL1\"},{\"device_id\":\"PC2\"}],\"total\":2}")));
        stubOk(WireMock.post(urlPathEqualTo("/_synapse/admin/v2/users/%40issa.kabore%3Alaafi.local/delete_devices")));

        mvc.perform(post("/api/v1/agents/issa.kabore/appareils/revocation")
                .header(HttpHeaders.AUTHORIZATION, bearer(ADMIN_SANTE))
                .contentType(MediaType.APPLICATION_JSON).content("{\"motif\":\"Téléphone perdu\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.statut").value("APPAREILS_REVOQUES"))
                .andExpect(jsonPath("$.appareilsSupprimes").value(2));

        WM.verify(postRequestedFor(urlPathEqualTo(KC + "kc-issa/logout")));
        WM.verify(postRequestedFor(urlPathEqualTo("/_synapse/admin/v2/users/%40issa.kabore%3Alaafi.local/delete_devices"))
                .withRequestBody(equalToJson("{\"devices\":[\"TEL1\",\"PC2\"]}")));
        // Le compte n'est ni désactivé ni désactivé côté Matrix
        WM.verify(0, putRequestedFor(anyUrl()));
        WM.verify(0, postRequestedFor(WireMock.urlPathMatching("/_synapse/admin/v1/deactivate/.*")));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM evenement_audit WHERE action='REVOCATION_APPAREILS'",
                Integer.class)).isEqualTo(1);
    }

    @Test
    @DisplayName("Bouton d'urgence : l'agent déconnecte lui-même tous ses appareils")
    void boutonUrgence() throws Exception {
        WM.stubFor(WireMock.get(urlPathEqualTo("/_synapse/admin/v2/users/%40issa.kabore%3Alaafi.local/devices"))
                .willReturn(okJson("{\"devices\":[{\"device_id\":\"TEL1\"}],\"total\":1}")));
        stubOk(WireMock.post(urlPathEqualTo("/_synapse/admin/v2/users/%40issa.kabore%3Alaafi.local/delete_devices")));

        mvc.perform(post("/api/v1/me/urgence").header(HttpHeaders.AUTHORIZATION, bearer(AGENT_SANTE)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.appareilsSupprimes").value(1));
        WM.verify(postRequestedFor(urlPathEqualTo(KC + "kc-issa/logout")));
        WM.verify(postRequestedFor(urlPathEqualTo("/_synapse/admin/v2/users/%40issa.kabore%3Alaafi.local/delete_devices")));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM evenement_audit WHERE action='URGENCE' AND acteur='issa.kabore'",
                Integer.class)).isEqualTo(1);
    }

    @Test
    @DisplayName("Jeton Synapse expiré (401) : reconnexion du compte de service puis nouvel essai")
    void renouvellementJetonSynapse() throws Exception {
        WM.stubFor(WireMock.post(urlPathEqualTo("/_synapse/admin/v1/deactivate/%40issa.kabore%3Alaafi.local"))
                .inScenario("expiration").whenScenarioStateIs(com.github.tomakehurst.wiremock.stubbing.Scenario.STARTED)
                .willReturn(aResponse().withStatus(401).withBody("{\"errcode\":\"M_UNKNOWN_TOKEN\"}"))
                .willSetStateTo("reconnecte"));
        WM.stubFor(WireMock.post(urlPathEqualTo("/_synapse/admin/v1/deactivate/%40issa.kabore%3Alaafi.local"))
                .inScenario("expiration").whenScenarioStateIs("reconnecte")
                .willReturn(okJson("{}")));

        revoquer(ADMIN_SANTE, "issa.kabore", "{\"motif\":\"Départ\"}").andExpect(status().isOk());
        WM.verify(2, postRequestedFor(urlPathEqualTo("/_synapse/admin/v1/deactivate/%40issa.kabore%3Alaafi.local")));
        WM.verify(WireMock.moreThanOrExactly(1), postRequestedFor(urlPathEqualTo("/_matrix/client/v3/login"))
                .withRequestBody(matchingJsonPath("$.type", equalTo("m.login.password"))));
    }

    @Test
    @DisplayName("Réactivation par le super_admin : Keycloak réactivé et Synapse deactivated=false")
    void reactivation() throws Exception {
        stubOk(WireMock.put(urlPathEqualTo("/_synapse/admin/v2/users/%40issa.kabore%3Alaafi.local")));
        mvc.perform(post("/api/v1/agents/issa.kabore/reactivation").header(HttpHeaders.AUTHORIZATION, bearer(SUPER_ADMIN)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.statut").value("ACTIF"));
        WM.verify(putRequestedFor(urlPathEqualTo(KC + "kc-issa"))
                .withRequestBody(matchingJsonPath("$.enabled", equalTo("true")))
                .withRequestBody(matchingJsonPath("$.attributes.enrole[0]", equalTo("true"))));
        WM.verify(putRequestedFor(urlPathEqualTo("/_synapse/admin/v2/users/%40issa.kabore%3Alaafi.local"))
                .withRequestBody(matchingJsonPath("$.deactivated", equalTo("false")))
                .withRequestBody(matchingJsonPath("$.external_ids[0].external_id", equalTo("kc-issa"))));
    }

    @Test
    @DisplayName("Fiche agent : détail + appareils Synapse")
    void detail() throws Exception {
        WM.stubFor(WireMock.get(urlPathEqualTo("/_synapse/admin/v2/users/%40issa.kabore%3Alaafi.local/devices"))
                .willReturn(okJson("{\"devices\":[{\"device_id\":\"TEL1\",\"display_name\":\"Laafi web\",\"last_seen_ts\":1767225600000}]}")));
        mvc.perform(get("/api/v1/agents/issa.kabore").header(HttpHeaders.AUTHORIZATION, bearer(ADMIN_SANTE)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.agent.ministere").value("MSHP"))
                .andExpect(jsonPath("$.agent.statut").value("ACTIF"))
                .andExpect(jsonPath("$.roles[0]").value("agent"))
                .andExpect(jsonPath("$.appareils[0].deviceId").value("TEL1"));
    }
}
