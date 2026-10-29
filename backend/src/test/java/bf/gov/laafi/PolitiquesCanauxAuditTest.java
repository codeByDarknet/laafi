package bf.gov.laafi;

import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.getRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

import com.github.tomakehurst.wiremock.client.WireMock;

/** Politiques de classification, canaux institutionnels, audit, liste admin et annuaire. */
class PolitiquesCanauxAuditTest extends TestBase {

    @Test
    @DisplayName("Politiques par défaut seedées par Flyway (contrat §6)")
    void politiquesParDefaut() throws Exception {
        mvc.perform(get("/api/v1/politiques").header(HttpHeaders.AUTHORIZATION, bearer(AGENT_MEF)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$[0].niveau").value("NORMAL"))
                .andExpect(jsonPath("$[1].niveau").value("DIFFUSION_RESTREINTE"))
                .andExpect(jsonPath("$[1].transfert").value("INTERNE_MINISTERE"))
                .andExpect(jsonPath("$[1].expirationJours").value(30))
                .andExpect(jsonPath("$[2].niveau").value("CONFIDENTIEL"))
                .andExpect(jsonPath("$[2].copie").value(false))
                .andExpect(jsonPath("$[2].expirationJours").value(7))
                .andExpect(jsonPath("$[2].filigraneNominatif").value(true))
                .andExpect(jsonPath("$[2].flouHorsFocus").value(true));
    }

    @Test
    @DisplayName("Modification d'une politique par le super_admin, journalisée")
    void modifierPolitique() throws Exception {
        String corps = """
                {"transfert":"INTERNE_MINISTERE","copie":true,"expirationJours":15,"filigrane":true,
                 "filigraneNominatif":false,"flouHorsFocus":false}""";
        mvc.perform(put("/api/v1/politiques/DIFFUSION_RESTREINTE").header(HttpHeaders.AUTHORIZATION, bearer(SUPER_ADMIN))
                .contentType(MediaType.APPLICATION_JSON).content(corps))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.expirationJours").value(15))
                .andExpect(jsonPath("$.modifiePar").value("super.admin"));
        mvc.perform(put("/api/v1/politiques/SECRET").header(HttpHeaders.AUTHORIZATION, bearer(SUPER_ADMIN))
                .contentType(MediaType.APPLICATION_JSON).content(corps))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("NIVEAU_INCONNU"));
        mvc.perform(put("/api/v1/politiques/DIFFUSION_RESTREINTE").header(HttpHeaders.AUTHORIZATION, bearer(ADMIN_SANTE))
                .contentType(MediaType.APPLICATION_JSON).content(corps))
                .andExpect(status().isForbidden());
        // remise à l'état initial pour les autres tests
        jdbc.update("UPDATE politique_classification SET expiration_jours = 30 WHERE niveau = 'DIFFUSION_RESTREINTE'");
    }

    @Test
    @DisplayName("Canaux : chef_service dans son ministère seulement, simple agent refusé, liste pour tous")
    void canaux() throws Exception {
        String canal = """
                {"roomId":"!drh:laafi.local","nom":"DRH Santé - notes de service","ministere":"%s",
                 "classification":"DIFFUSION_RESTREINTE"}""";
        mvc.perform(post("/api/v1/canaux").header(HttpHeaders.AUTHORIZATION, bearer(CHEF_SANTE))
                .contentType(MediaType.APPLICATION_JSON).content(canal.formatted("MSHP")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.ministere").value("MSHP"))
                .andExpect(jsonPath("$.creePar").value("awa.sawadogo"));
        mvc.perform(post("/api/v1/canaux").header(HttpHeaders.AUTHORIZATION, bearer(CHEF_SANTE))
                .contentType(MediaType.APPLICATION_JSON).content(canal.formatted("MEF").replace("!drh", "!autre")))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("HORS_PERIMETRE"));
        mvc.perform(post("/api/v1/canaux").header(HttpHeaders.AUTHORIZATION, bearer(AGENT_SANTE))
                .contentType(MediaType.APPLICATION_JSON).content(canal.formatted("MSHP").replace("!drh", "!x")))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/canaux").header(HttpHeaders.AUTHORIZATION, bearer(SUPER_ADMIN))
                .contentType(MediaType.APPLICATION_JSON).content(canal.formatted("MSHP")))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CANAL_EXISTANT"));
        mvc.perform(get("/api/v1/canaux").header(HttpHeaders.AUTHORIZATION, bearer(AGENT_MEF)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].roomId").value("!drh:laafi.local"));
    }

    @Test
    @DisplayName("Audit : l'admin d'un ministère ne voit que les événements de son ministère")
    void auditCloisonne() throws Exception {
        jdbc.update("INSERT INTO evenement_audit(horodatage, acteur, action, cible, ministere, motif) "
                + "VALUES (CURRENT_TIMESTAMP, 'admin.sante', 'REVOCATION_TOTALE', 'issa.kabore', 'MSHP', 'test')");
        jdbc.update("INSERT INTO evenement_audit(horodatage, acteur, action, cible, ministere, motif) "
                + "VALUES (CURRENT_TIMESTAMP, 'super.admin', 'REVOCATION_TOTALE', 'paul.zongo', 'MEF', 'test')");
        mvc.perform(get("/api/v1/audit").header(HttpHeaders.AUTHORIZATION, bearer(ADMIN_SANTE)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.elements[0].cible").value("issa.kabore"));
        mvc.perform(get("/api/v1/audit").header(HttpHeaders.AUTHORIZATION, bearer(SUPER_ADMIN)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(2));
    }

    @Test
    @DisplayName("Liste admin : périmètre forcé au ministère de l'admin, statut calculé")
    void listeAdmin() throws Exception {
        WM.stubFor(WireMock.get(urlPathEqualTo("/auth/admin/realms/laafi/users"))
                .withQueryParam("q", equalTo("ministere:MSHP"))
                .willReturn(okJson("[" + utilisateurKc("kc-issa", "issa.kabore", "Issa", "Kaboré", "MSHP", true) + ","
                        + utilisateurKc("kc-old", "ancien.agent", "Ancien", "Agent", "MSHP", false) + ","
                        // un compte d'un autre ministère renvoyé par erreur doit être filtré
                        + utilisateurKc("kc-paul", "paul.zongo", "Paul", "Zongo", "MEF", true) + "]")));
        mvc.perform(get("/api/v1/agents").header(HttpHeaders.AUTHORIZATION, bearer(ADMIN_SANTE)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].statut").value("ACTIF"))
                .andExpect(jsonPath("$[1].statut").value("REVOQUE"));
        mvc.perform(get("/api/v1/agents").param("statut", "REVOQUE").header(HttpHeaders.AUTHORIZATION, bearer(ADMIN_SANTE)))
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].username").value("ancien.agent"));
        mvc.perform(get("/api/v1/agents").param("ministere", "MEF").header(HttpHeaders.AUTHORIZATION, bearer(ADMIN_SANTE)))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("Annuaire : seuls les agents actifs et enrôlés, avec identifiant Matrix")
    void annuaire() throws Exception {
        WM.stubFor(WireMock.get(urlPathEqualTo("/auth/admin/realms/laafi/users"))
                .willReturn(okJson("[" + utilisateurKc("kc-issa", "issa.kabore", "Issa", "Kaboré", "MSHP", true) + "]")));
        mvc.perform(get("/api/v1/annuaire").param("q", "kab").header(HttpHeaders.AUTHORIZATION, bearer(AGENT_MEF)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.elements[0].matrixId").value("@issa.kabore:laafi.local"))
                .andExpect(jsonPath("$.elements[0].nom").value("Issa Kaboré"))
                .andExpect(jsonPath("$.pageSuivante").value(false));
        WM.verify(getRequestedFor(urlPathEqualTo("/auth/admin/realms/laafi/users"))
                .withQueryParam("enabled", equalTo("true"))
                .withQueryParam("q", equalTo("enrole:true"))
                .withQueryParam("search", equalTo("kab")));
    }
}
