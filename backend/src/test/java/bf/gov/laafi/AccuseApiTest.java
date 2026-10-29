package bf.gov.laafi;

import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;
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

/** API des accusés de lecture probants : membres du salon uniquement, preuve signée, vérification admin. */
class AccuseApiTest extends TestBase {

    private static final String SALON = "!instr:laafi.local";
    private static final String CORPS = """
            {"roomId":"!instr:laafi.local","eventId":"$abc123","empreinte":"%s"}""".formatted("0123456789abcdef".repeat(4));

    @BeforeEach
    void membres() {
        WM.stubFor(WireMock.get(urlPathEqualTo("/_synapse/admin/v1/rooms/%21instr%3Alaafi.local/members"))
                .willReturn(okJson("{\"members\":[\"@issa.kabore:laafi.local\",\"@awa.sawadogo:laafi.local\"],\"total\":2}")));
    }

    @Test
    @DisplayName("Un membre du salon obtient une preuve signée ; un non-membre est refusé")
    void accuse() throws Exception {
        mvc.perform(post("/api/v1/accuses").header(HttpHeaders.AUTHORIZATION, bearer(AGENT_SANTE))
                .contentType(MediaType.APPLICATION_JSON).content(CORPS))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.entree.id").value(1))
                .andExpect(jsonPath("$.entree.agent").value("issa.kabore"))
                .andExpect(jsonPath("$.algorithme").value("Ed25519"))
                .andExpect(jsonPath("$.hashPrecedent").value("0".repeat(64)))
                .andExpect(jsonPath("$.verifieeParLeServeur").value(true))
                .andExpect(jsonPath("$.signature").isString())
                .andExpect(jsonPath("$.clePublique").isString());

        mvc.perform(post("/api/v1/accuses").header(HttpHeaders.AUTHORIZATION, bearer(AGENT_MEF))
                .contentType(MediaType.APPLICATION_JSON).content(CORPS))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("NON_MEMBRE_SALON"));

        // Liste et preuve : visibles par un autre membre, pas par un non-membre
        mvc.perform(get("/api/v1/accuses").param("eventId", "$abc123").header(HttpHeaders.AUTHORIZATION, bearer(CHEF_SANTE)))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].agent").value("issa.kabore"));
        mvc.perform(get("/api/v1/accuses").param("eventId", "$abc123").header(HttpHeaders.AUTHORIZATION, bearer(AGENT_MEF)))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/accuses/1/preuve").header(HttpHeaders.AUTHORIZATION, bearer(CHEF_SANTE)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.entree.eventId").value("$abc123"));
        mvc.perform(get("/api/v1/accuses/99/preuve").header(HttpHeaders.AUTHORIZATION, bearer(AGENT_SANTE)))
                .andExpect(status().isNotFound());

        // Vérification d'intégrité par un admin
        mvc.perform(get("/api/v1/journal/verification").header(HttpHeaders.AUTHORIZATION, bearer(ADMIN_SANTE)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.integre").value(true))
                .andExpect(jsonPath("$.nombreEntrees").value(1));
    }

    @Test
    @DisplayName("Empreinte ou identifiants invalides : 400 (le serveur n'accepte jamais de contenu)")
    void validation() throws Exception {
        mvc.perform(post("/api/v1/accuses").header(HttpHeaders.AUTHORIZATION, bearer(AGENT_SANTE))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"roomId\":\"!instr:laafi.local\",\"eventId\":\"$e\",\"empreinte\":\"Texte du message en clair\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION"));
        mvc.perform(post("/api/v1/accuses").header(HttpHeaders.AUTHORIZATION, bearer(AGENT_SANTE))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"roomId\":\"!a|b:laafi.local\",\"eventId\":\"$e\",\"empreinte\":\"%s\"}".formatted("a".repeat(64))))
                .andExpect(status().isBadRequest());
    }
}
