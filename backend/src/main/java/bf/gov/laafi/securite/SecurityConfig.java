package bf.gov.laafi.securite;

import java.nio.charset.StandardCharsets;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.web.SecurityFilterChain;

import bf.gov.laafi.config.LaafiProperties;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Sécurité de l'API : chaque requête (sauf /sante) doit porter un jeton JWT Keycloak valide.
 * Pas de session serveur, pas de cookie : le jeton est envoyé à chaque appel (Authorization: Bearer ...).
 * Les droits fins sont posés par @PreAuthorize sur chaque endpoint (d'où @EnableMethodSecurity).
 */
@Configuration
@EnableMethodSecurity
public class SecurityConfig {

    @Bean
    SecurityFilterChain filtreSecurite(HttpSecurity http) throws Exception {
        http
                // API sans état authentifiée par jeton Bearer : pas de cookie, donc pas de risque CSRF.
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(a -> a
                        .requestMatchers(HttpMethod.GET, "/api/v1/sante", "/actuator/health").permitAll()
                        .requestMatchers("/error").permitAll()
                        .requestMatchers("/api/v1/**").authenticated()
                        .anyRequest().denyAll())
                .oauth2ResourceServer(o -> o
                        .jwt(j -> j.jwtAuthenticationConverter(new ConvertisseurJwt()))
                        .authenticationEntryPoint((req, res, ex) -> ecrireErreur(res, HttpStatus.UNAUTHORIZED,
                                "NON_AUTHENTIFIE", "Jeton d'authentification absent, invalide ou expiré."))
                        .accessDeniedHandler((req, res, ex) -> ecrireErreur(res, HttpStatus.FORBIDDEN,
                                "ACCES_REFUSE", "Vous n'avez pas les droits nécessaires pour cette action.")))
                .exceptionHandling(e -> e
                        .authenticationEntryPoint((req, res, ex) -> ecrireErreur(res, HttpStatus.UNAUTHORIZED,
                                "NON_AUTHENTIFIE", "Jeton d'authentification absent, invalide ou expiré."))
                        .accessDeniedHandler((req, res, ex) -> ecrireErreur(res, HttpStatus.FORBIDDEN,
                                "ACCES_REFUSE", "Vous n'avez pas les droits nécessaires pour cette action.")));
        return http.build();
    }

    /**
     * Décodeur JWT : les clés publiques de Keycloak sont lues par l'URL INTERNE (http://keycloak:8080/...),
     * mais l'issuer exigé est l'URL PUBLIQUE (celle qu'a vue le navigateur lors de la connexion).
     * Validations : signature RS256, expiration (exp/nbf), issuer, et client autorisé (azp).
     */
    @Bean
    JwtDecoder jwtDecoder(LaafiProperties props) {
        NimbusJwtDecoder decodeur = NimbusJwtDecoder.withJwkSetUri(props.keycloak().jwkSetUri()).build();
        decodeur.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
                JwtValidators.createDefaultWithIssuer(props.issuerAttendu()),
                new ValidateurClientAutorise(props.securite() == null ? null : props.securite().clientsAutorises())));
        return decodeur;
    }

    private static void ecrireErreur(HttpServletResponse res, HttpStatus statut, String code, String message)
            throws java.io.IOException {
        res.setStatus(statut.value());
        res.setContentType(MediaType.APPLICATION_JSON_VALUE);
        res.setCharacterEncoding(StandardCharsets.UTF_8.name());
        res.getWriter().write("{\"code\":\"" + code + "\",\"message\":\"" + message.replace("\"", "'") + "\"}");
    }
}
