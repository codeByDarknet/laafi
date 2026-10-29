package bf.gov.laafi;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.equalTo;
import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.nio.file.Files;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;

/**
 * Socle des tests d'intégration :
 *  - l'application démarre réellement (Spring Boot + H2 + Flyway) ;
 *  - Keycloak et Synapse sont SIMULÉS par un serveur WireMock (vrais appels HTTP, vérifiables) ;
 *  - le décodeur JWT est remplacé : chaque « jeton » de test correspond à un utilisateur fictif du contrat §3.
 *    Le reste de la chaîne de sécurité (conversion des rôles, @PreAuthorize, portée ministère) est le vrai code.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
public abstract class TestBase {

    protected static final WireMockServer WM = new WireMockServer(WireMockConfiguration.options().dynamicPort());

    static {
        WM.start();
    }

    // Jetons de test (valeur du header Authorization: Bearer <jeton>)
    public static final String SUPER_ADMIN = "jeton-super-admin";
    public static final String ADMIN_SANTE = "jeton-admin-sante";
    public static final String CHEF_SANTE = "jeton-chef-sante";
    public static final String AGENT_SANTE = "jeton-agent-sante";
    public static final String AGENT_MEF = "jeton-agent-mef";

    @DynamicPropertySource
    static void proprietes(DynamicPropertyRegistry r) throws IOException {
        r.add("laafi.keycloak.url", () -> WM.baseUrl() + "/auth");
        r.add("laafi.synapse.url", WM::baseUrl);
        String dir = Files.createTempDirectory("laafi-cles").toString();
        r.add("laafi.journal.repertoire-cles", () -> dir);
    }

    @MockitoBean
    protected JwtDecoder jwtDecoder;

    @Autowired
    protected MockMvc mvc;

    @Autowired
    protected JdbcTemplate jdbc;

    private static final Map<String, Jwt> JETONS = Map.of(
            SUPER_ADMIN, jwt("kc-super", "super.admin", "Admin", "DGTD", "MTDPCE", List.of("super_admin", "agent")),
            ADMIN_SANTE, jwt("kc-admin-sante", "admin.sante", "Rasmata", "Compaoré", "MSHP",
                    List.of("admin_ministere", "agent")),
            CHEF_SANTE, jwt("kc-awa", "awa.sawadogo", "Awa", "Sawadogo", "MSHP", List.of("chef_service", "agent")),
            AGENT_SANTE, jwt("kc-issa", "issa.kabore", "Issa", "Kaboré", "MSHP", List.of("agent")),
            AGENT_MEF, jwt("kc-paul", "paul.zongo", "Paul", "Zongo", "MEF", List.of("agent")));

    static Jwt jwt(String sub, String username, String prenom, String nom, String ministere, List<String> roles) {
        return Jwt.withTokenValue("x")
                .header("alg", "RS256")
                .subject(sub)
                .issuer("http://localhost:8888/auth/realms/laafi")
                .issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(300))
                .claim("azp", "laafi-console")
                .claim("preferred_username", username)
                .claim("given_name", prenom)
                .claim("family_name", nom)
                .claim("ministere", ministere)
                .claim("fonction", "Fonction fictive")
                .claim("matricule", "MAT-" + username)
                .claim("realm_access", Map.of("roles", roles))
                .build();
    }

    @BeforeEach
    void preparerSocle() {
        when(jwtDecoder.decode(anyString())).thenAnswer(inv -> {
            Jwt j = JETONS.get(inv.<String>getArgument(0));
            if (j == null) {
                throw new BadJwtException("jeton invalide");
            }
            return j;
        });
        WM.resetAll();
        // Jeton client_credentials de laafi-backend
        WM.stubFor(post(urlPathEqualTo("/auth/realms/laafi/protocol/openid-connect/token"))
                .willReturn(okJson("{\"access_token\":\"jeton-kc\",\"expires_in\":300}")));
        // Connexion du compte de service Synapse
        WM.stubFor(post(urlPathEqualTo("/_matrix/client/v3/login"))
                .willReturn(okJson("{\"access_token\":\"jeton-synapse\",\"user_id\":\"@laafi-service:laafi.local\"}")));
        jdbc.update("DELETE FROM accuse_lecture");
        jdbc.update("DELETE FROM evenement_audit");
        jdbc.update("DELETE FROM etat_agent");
        jdbc.update("DELETE FROM canal_institutionnel");
    }

    protected static String bearer(String jeton) {
        return "Bearer " + jeton;
    }

    // ---------------------------------------------------------------- fixtures Keycloak

    protected static String utilisateurKc(String id, String username, String prenom, String nom, String ministere,
            boolean actif) {
        return """
                {"id":"%s","username":"%s","firstName":"%s","lastName":"%s","enabled":%s,
                 "createdTimestamp":1767225600000,
                 "attributes":{"ministere":["%s"],"fonction":["Fonction fictive"],"matricule":["M-%s"],"enrole":["true"]}}
                """.formatted(id, username, prenom, nom, actif, ministere, id);
    }

    /** Déclare un utilisateur Keycloak (recherche exacte par username + rôles realm). */
    protected static void stubUtilisateur(String id, String username, String ministere, String... roles) {
        WM.stubFor(get(urlPathEqualTo("/auth/admin/realms/laafi/users"))
                .withQueryParam("username", equalTo(username))
                .willReturn(okJson("[" + utilisateurKc(id, username, "Prénom", "Nom", ministere, true) + "]")));
        StringBuilder rs = new StringBuilder("[");
        for (int i = 0; i < roles.length; i++) {
            rs.append(i > 0 ? "," : "").append("{\"name\":\"").append(roles[i]).append("\"}");
        }
        WM.stubFor(get(urlPathEqualTo("/auth/admin/realms/laafi/users/" + id + "/role-mappings/realm"))
                .willReturn(okJson(rs.append("]").toString())));
    }

    protected static void stubUtilisateurAbsent(String username) {
        WM.stubFor(get(urlPathEqualTo("/auth/admin/realms/laafi/users"))
                .withQueryParam("username", equalTo(username))
                .willReturn(okJson("[]")));
    }

    protected static void stubOk(com.github.tomakehurst.wiremock.client.MappingBuilder m) {
        WM.stubFor(m.willReturn(aResponse().withStatus(204)));
    }
}
