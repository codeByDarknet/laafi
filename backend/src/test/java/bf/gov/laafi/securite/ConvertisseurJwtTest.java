package bf.gov.laafi.securite;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtValidators;

/** Tests unitaires de la conversion des rôles et des validateurs de jetons. */
class ConvertisseurJwtTest {

    private static Jwt.Builder base() {
        return Jwt.withTokenValue("t").header("alg", "RS256").subject("s")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60))
                .claim("preferred_username", "awa.sawadogo");
    }

    @Test
    @DisplayName("realm_access.roles → ROLE_<ROLE> en majuscules, principal = preferred_username")
    void roles() {
        Jwt jwt = base().claim("realm_access", Map.of("roles", List.of("agent", "chef_service", "offline_access"))).build();
        var auth = new ConvertisseurJwt().convert(jwt);
        assertThat(auth.getName()).isEqualTo("awa.sawadogo");
        assertThat(auth.getAuthorities()).extracting(GrantedAuthority::getAuthority)
                .containsExactlyInAnyOrder("ROLE_AGENT", "ROLE_CHEF_SERVICE", "ROLE_OFFLINE_ACCESS");
    }

    @Test
    @DisplayName("Jeton sans realm_access : aucun rôle")
    void sansRoles() {
        assertThat(new ConvertisseurJwt().convert(base().build()).getAuthorities()).isEmpty();
    }

    @Test
    @DisplayName("Issuer : seul l'issuer PUBLIC de Keycloak est accepté")
    void issuer() {
        OAuth2TokenValidator<Jwt> v = JwtValidators.createDefaultWithIssuer("http://localhost:8888/auth/realms/laafi");
        assertThat(v.validate(base().issuer("http://localhost:8888/auth/realms/laafi").build()).hasErrors()).isFalse();
        assertThat(v.validate(base().issuer("http://keycloak:8080/auth/realms/autre").build()).hasErrors()).isTrue();
    }

    @Test
    @DisplayName("Jeton expiré refusé")
    void expire() {
        OAuth2TokenValidator<Jwt> v = JwtValidators.createDefaultWithIssuer("i");
        Jwt jwt = Jwt.withTokenValue("t").header("alg", "RS256").issuer("i")
                .issuedAt(Instant.now().minusSeconds(3600)).expiresAt(Instant.now().minusSeconds(600)).build();
        assertThat(v.validate(jwt).hasErrors()).isTrue();
    }

    @Test
    @DisplayName("azp : seuls les clients laafi-console / laafi-client sont acceptés")
    void clientAutorise() {
        var v = new ValidateurClientAutorise(List.of("laafi-console", "laafi-client"));
        assertThat(v.validate(base().claim("azp", "laafi-client").build()).hasErrors()).isFalse();
        assertThat(v.validate(base().claim("azp", "synapse").build()).hasErrors()).isTrue();
        assertThat(v.validate(base().build()).hasErrors()).isTrue();
    }
}
