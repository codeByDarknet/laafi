package bf.gov.laafi.securite;

import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

/**
 * Vue simplifiée de l'agent authentifié, extraite du JWT Keycloak (déjà vérifié par Spring Security :
 * signature, expiration, issuer). Le claim "ministere" sert au contrôle de portée des admins de ministère.
 */
public record UtilisateurCourant(
        String username,
        String sub,
        String prenom,
        String nom,
        String ministere,
        String direction,
        String fonction,
        String matricule,
        Set<String> roles) {

    public static UtilisateurCourant depuis(JwtAuthenticationToken auth) {
        var jwt = auth.getToken();
        Set<String> roles = auth.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .filter(a -> a.startsWith("ROLE_"))
                .map(a -> a.substring(5).toLowerCase())
                .collect(Collectors.toUnmodifiableSet());
        return new UtilisateurCourant(
                jwt.getClaimAsString("preferred_username"),
                jwt.getSubject(),
                jwt.getClaimAsString("given_name"),
                jwt.getClaimAsString("family_name"),
                jwt.getClaimAsString("ministere"),
                jwt.getClaimAsString("direction"),
                jwt.getClaimAsString("fonction"),
                jwt.getClaimAsString("matricule"),
                roles);
    }

    public boolean aRole(String role) {
        return roles.contains(role);
    }

    public boolean estSuperAdmin() {
        return aRole(Roles.SUPER_ADMIN);
    }

    public boolean estAdmin() {
        return estSuperAdmin() || aRole(Roles.ADMIN_MINISTERE);
    }
}
