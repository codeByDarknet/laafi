package bf.gov.laafi;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

/** Authentification et autorisation par rôle sur l'API. */
class SecuriteApiTest extends TestBase {

    @Test
    @DisplayName("Sans JWT : 401 avec erreur JSON en français")
    void refusSansJwt() throws Exception {
        mvc.perform(get("/api/v1/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("NON_AUTHENTIFIE"))
                .andExpect(jsonPath("$.message").exists());
        mvc.perform(post("/api/v1/agents/issa.kabore/revocation").contentType(MediaType.APPLICATION_JSON)
                .content("{\"motif\":\"x\"}"))
                .andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/ministeres")).andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("JWT invalide (signature, issuer, expiration...) : 401")
    void refusJwtInvalide() throws Exception {
        mvc.perform(get("/api/v1/me").header(HttpHeaders.AUTHORIZATION, bearer("jeton-forge")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("NON_AUTHENTIFIE"));
    }

    @Test
    @DisplayName("Healthcheck public")
    void santePublique() throws Exception {
        mvc.perform(get("/api/v1/sante")).andExpect(status().isOk()).andExpect(jsonPath("$.statut").value("OK"));
    }

    @Test
    @DisplayName("Profil courant construit depuis le JWT")
    void profil() throws Exception {
        mvc.perform(get("/api/v1/me").header(HttpHeaders.AUTHORIZATION, bearer(AGENT_SANTE)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("issa.kabore"))
                .andExpect(jsonPath("$.matrixId").value("@issa.kabore:laafi.local"))
                .andExpect(jsonPath("$.ministere").value("MSHP"))
                .andExpect(jsonPath("$.roles[0]").value("agent"));
    }

    @Test
    @DisplayName("Un simple agent ne peut accéder à aucune fonction d'administration")
    void refusRoleAgent() throws Exception {
        String agent = bearer(AGENT_SANTE);
        mvc.perform(get("/api/v1/agents").header(HttpHeaders.AUTHORIZATION, agent))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ACCES_REFUSE"));
        mvc.perform(post("/api/v1/agents/paul.zongo/revocation").header(HttpHeaders.AUTHORIZATION, agent)
                .contentType(MediaType.APPLICATION_JSON).content("{\"motif\":\"test\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/agents/paul.zongo/appareils/revocation").header(HttpHeaders.AUTHORIZATION, agent))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/journal/verification").header(HttpHeaders.AUTHORIZATION, agent))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/audit").header(HttpHeaders.AUTHORIZATION, agent))
                .andExpect(status().isForbidden());
        mvc.perform(put("/api/v1/politiques/NORMAL").header(HttpHeaders.AUTHORIZATION, agent)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"transfert\":\"INTERDIT\",\"copie\":false,\"filigrane\":true,\"filigraneNominatif\":true,\"flouHorsFocus\":true}"))
                .andExpect(status().isForbidden());
        // Aucun appel ne doit avoir atteint Keycloak ni Synapse
        org.assertj.core.api.Assertions.assertThat(WM.getAllServeEvents()).isEmpty();
    }

    @Test
    @DisplayName("Enrôlement interdit sans rôle d'administration")
    void enrolementInterditSansRole() throws Exception {
        String corps = """
                {"prenom":"Ali","nom":"Ouédraogo","fonction":"Agent","matricule":"X1","ministere":"MSHP"}""";
        for (String jeton : new String[] {AGENT_SANTE, CHEF_SANTE}) {
            mvc.perform(post("/api/v1/agents").header(HttpHeaders.AUTHORIZATION, bearer(jeton))
                    .contentType(MediaType.APPLICATION_JSON).content(corps))
                    .andExpect(status().isForbidden());
        }
        org.assertj.core.api.Assertions.assertThat(WM.getAllServeEvents()).isEmpty();
    }

    @Test
    @DisplayName("Réactivation réservée au super_admin")
    void reactivationReserveeSuperAdmin() throws Exception {
        mvc.perform(post("/api/v1/agents/issa.kabore/reactivation").header(HttpHeaders.AUTHORIZATION, bearer(ADMIN_SANTE)))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("Référentiel ministères accessible à tout utilisateur authentifié")
    void ministeres() throws Exception {
        mvc.perform(get("/api/v1/ministeres").header(HttpHeaders.AUTHORIZATION, bearer(AGENT_MEF)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(7))
                .andExpect(jsonPath("$[?(@.code=='MSHP')]").exists());
    }
}
