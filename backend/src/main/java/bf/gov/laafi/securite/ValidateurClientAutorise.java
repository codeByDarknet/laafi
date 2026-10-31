package bf.gov.laafi.securite;

import java.util.List;

import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;

/**
 * Durcissement : n'accepte que les jetons émis pour nos applications (claim "azp" = client OIDC
 * qui a obtenu le jeton : laafi-console ou laafi-client). Un jeton obtenu par un autre client
 * du realm (ex. "synapse") est refusé même s'il est correctement signé.
 */
public class ValidateurClientAutorise implements OAuth2TokenValidator<Jwt> {

    private final List<String> clientsAutorises;

    public ValidateurClientAutorise(List<String> clientsAutorises) {
        this.clientsAutorises = clientsAutorises == null ? List.of() : clientsAutorises;
    }

    @Override
    public OAuth2TokenValidatorResult validate(Jwt jwt) {
        String azp = jwt.getClaimAsString("azp");
        if (clientsAutorises.isEmpty() || (azp != null && clientsAutorises.contains(azp))) {
            return OAuth2TokenValidatorResult.success();
        }
        return OAuth2TokenValidatorResult.failure(
                new OAuth2Error("invalid_token", "Jeton émis pour un client non autorisé", null));
    }
}
