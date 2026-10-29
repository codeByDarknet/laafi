package bf.gov.laafi.securite;

import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.springframework.core.convert.converter.Converter;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

/**
 * Transforme un jeton Keycloak validé en identité Spring Security.
 * Les rôles viennent du claim realm_access.roles : "admin_ministere" devient l'autorité "ROLE_ADMIN_MINISTERE".
 * Le nom du principal est le preferred_username (= localpart Matrix).
 */
public class ConvertisseurJwt implements Converter<Jwt, AbstractAuthenticationToken> {

    @Override
    public AbstractAuthenticationToken convert(Jwt jwt) {
        return new JwtAuthenticationToken(jwt, autorites(jwt), jwt.getClaimAsString("preferred_username"));
    }

    static Collection<GrantedAuthority> autorites(Jwt jwt) {
        Map<String, Object> realmAccess = jwt.getClaimAsMap("realm_access");
        if (realmAccess == null || !(realmAccess.get("roles") instanceof Collection<?> roles)) {
            return List.of();
        }
        return roles.stream()
                .map(String::valueOf)
                .map(r -> (GrantedAuthority) new SimpleGrantedAuthority("ROLE_" + r.toUpperCase(Locale.ROOT)))
                .toList();
    }
}
