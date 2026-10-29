package bf.gov.laafi.config;

import java.time.Duration;
import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.util.StringUtils;

/**
 * Configuration applicative, alimentée par les variables d'environnement (voir application.yml).
 */
@ConfigurationProperties(prefix = "laafi")
public record LaafiProperties(
        String publicUrl,
        Matrix matrix,
        Keycloak keycloak,
        Synapse synapse,
        Journal journal,
        Securite securite) {

    /** Nom de domaine Matrix : les identifiants sont de la forme @prenom.nom:laafi.local */
    public record Matrix(String serverName) {
    }

    public record Keycloak(
            String url,
            String realm,
            String clientId,
            String clientSecret,
            String issuer) {

        /** URL interne des clés publiques de signature des jetons (vue depuis le conteneur). */
        public String jwkSetUri() {
            return url + "/realms/" + realm + "/protocol/openid-connect/certs";
        }

        public String tokenUri() {
            return url + "/realms/" + realm + "/protocol/openid-connect/token";
        }
    }

    public record Synapse(
            String url,
            String serviceUser,
            String servicePassword,
            String idpId,
            boolean connexionAuDemarrage,
            Duration delaiReessai,
            int tentativesMax) {
    }

    /** Répertoire (volume Docker) où est persistée la paire de clés Ed25519 du journal probant. */
    public record Journal(String repertoireCles) {
    }

    /** Clients OIDC (claim azp) autorisés à appeler l'API. Liste vide = pas de filtrage. */
    public record Securite(List<String> clientsAutorises) {
    }

    /**
     * Issuer attendu dans les jetons : l'URL PUBLIQUE de Keycloak (celle vue par le navigateur),
     * alors que les clés sont récupérées par l'URL interne. Voir contrat §2 « problème d'issuer ».
     */
    public String issuerAttendu() {
        if (keycloak != null && StringUtils.hasText(keycloak.issuer())) {
            return keycloak.issuer();
        }
        return publicUrl + "/auth/realms/" + keycloak.realm();
    }
}
