package bf.gov.laafi.securite;

/**
 * Rôles realm Keycloak (contrat §3). Dans Spring Security ils deviennent ROLE_AGENT, ROLE_SUPER_ADMIN, etc.
 * Les expressions ci-dessous sont utilisées dans les annotations @PreAuthorize des contrôleurs.
 */
public final class Roles {

    public static final String AGENT = "agent";
    public static final String CHEF_SERVICE = "chef_service";
    public static final String ADMIN_MINISTERE = "admin_ministere";
    public static final String SUPER_ADMIN = "super_admin";

    public static final String EST_AGENT = "hasRole('AGENT')";
    public static final String EST_ADMIN = "hasAnyRole('ADMIN_MINISTERE','SUPER_ADMIN')";
    public static final String EST_SUPER_ADMIN = "hasRole('SUPER_ADMIN')";
    public static final String EST_CHEF_OU_PLUS = "hasAnyRole('CHEF_SERVICE','ADMIN_MINISTERE','SUPER_ADMIN')";

    private Roles() {
    }
}
