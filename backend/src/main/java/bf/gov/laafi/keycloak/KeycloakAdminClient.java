package bf.gov.laafi.keycloak;

import java.net.URI;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.ClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.util.UriBuilder;

import bf.gov.laafi.config.LaafiProperties;
import bf.gov.laafi.erreur.ApiException;

/**
 * Client de l'API d'administration REST de Keycloak.
 *
 * Authentification : le backend est le client confidentiel "laafi-backend" ; il obtient un jeton par le
 * flux OAuth2 "client_credentials" (identifiant + secret, sans utilisateur humain). Son compte de service
 * possède uniquement les rôles realm-management manage-users / view-users / query-users (moindre privilège).
 * Le jeton est mis en cache jusqu'à peu avant son expiration, et redemandé si Keycloak répond 401.
 */
@Component
public class KeycloakAdminClient {

    private static final ParameterizedTypeReference<List<Map<String, Object>>> LISTE =
            new ParameterizedTypeReference<>() {
            };
    private static final ParameterizedTypeReference<Map<String, Object>> OBJET =
            new ParameterizedTypeReference<>() {
            };

    private final LaafiProperties.Keycloak config;
    private final RestClient http;

    private String jeton;
    private Instant expiration = Instant.EPOCH;

    public KeycloakAdminClient(LaafiProperties props, RestClient.Builder builder,
            ClientHttpRequestFactory requestFactory) {
        this.config = props.keycloak();
        this.http = builder.clone().requestFactory(requestFactory).build();
    }

    // ---------------------------------------------------------------- jeton de service

    private synchronized String jeton() {
        if (jeton == null || Instant.now().isAfter(expiration)) {
            MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
            form.add("grant_type", "client_credentials");
            form.add("client_id", config.clientId());
            form.add("client_secret", config.clientSecret());
            Map<String, Object> rep;
            try {
                rep = enveloppe(() -> http.post().uri(config.tokenUri())
                        .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                        .body(form)
                        .retrieve()
                        .body(OBJET));
            } catch (HttpClientErrorException.Unauthorized e) {
                throw ApiException.serviceIndisponible("Authentification du backend auprès de Keycloak refusée (secret client ?).");
            }
            jeton = (String) rep.get("access_token");
            long duree = rep.get("expires_in") instanceof Number n ? n.longValue() : 60;
            expiration = Instant.now().plusSeconds(Math.max(5, duree - 30));
        }
        return jeton;
    }

    private synchronized void invaliderJeton() {
        jeton = null;
    }

    /** Exécute un appel admin ; si le jeton a été révoqué/expiré (401), on en redemande un et on réessaie une fois. */
    private <T> T appel(java.util.function.Function<String, T> requete) {
        try {
            return enveloppe(() -> requete.apply(jeton()));
        } catch (ApiException e) {
            throw e;
        } catch (HttpClientErrorException.Unauthorized e) {
            invaliderJeton();
            try {
                return enveloppe(() -> requete.apply(jeton()));
            } catch (HttpClientErrorException.Unauthorized encore) {
                throw ApiException.serviceIndisponible("Le compte de service Keycloak n'est pas autorisé.");
            }
        }
    }

    private String admin() {
        return config.url() + "/admin/realms/" + config.realm();
    }

    // ---------------------------------------------------------------- utilisateurs

    public UtilisateurKeycloak trouverParUsername(String username) {
        List<Map<String, Object>> res = appel(t -> http.get()
                .uri(admin() + "/users", (UriBuilder u) -> u
                        .queryParam("username", username)
                        .queryParam("exact", true)
                        .queryParam("briefRepresentation", false)
                        .build())
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + t)
                .retrieve().body(LISTE));
        return res == null ? null : res.stream()
                .filter(u -> username.equalsIgnoreCase(String.valueOf(u.get("username"))))
                .findFirst().map(UtilisateurKeycloak::new).orElse(null);
    }

    /**
     * Recherche d'utilisateurs. Le paramètre Keycloak "q" filtre sur les attributs
     * (ex. "ministere:MSHP enrole:true").
     */
    public List<UtilisateurKeycloak> rechercher(String texte, String filtreAttributs, Boolean actifs,
            int premier, int max) {
        List<Map<String, Object>> res = appel(t -> http.get()
                .uri(admin() + "/users", (UriBuilder u) -> {
                    if (texte != null && !texte.isBlank()) {
                        u.queryParam("search", texte.trim());
                    }
                    if (filtreAttributs != null && !filtreAttributs.isBlank()) {
                        u.queryParam("q", filtreAttributs);
                    }
                    if (actifs != null) {
                        u.queryParam("enabled", actifs);
                    }
                    return u.queryParam("first", premier)
                            .queryParam("max", max)
                            .queryParam("briefRepresentation", false)
                            .build();
                })
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + t)
                .retrieve().body(LISTE));
        return res == null ? List.of() : res.stream().map(UtilisateurKeycloak::new).toList();
    }

    /** Crée l'utilisateur et renvoie son identifiant Keycloak (sub), lu dans l'en-tête Location. */
    public String creer(Map<String, Object> representation) {
        URI location = appel(t -> http.post().uri(admin() + "/users")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + t)
                .contentType(MediaType.APPLICATION_JSON)
                .body(representation)
                .retrieve().toBodilessEntity().getHeaders().getLocation());
        if (location == null) {
            throw ApiException.serviceIndisponible("Keycloak n'a pas renvoyé l'identifiant du compte créé.");
        }
        String chemin = location.getPath();
        return chemin.substring(chemin.lastIndexOf('/') + 1);
    }

    public void mettreAJour(String id, Map<String, Object> representation) {
        appel(t -> http.put().uri(admin() + "/users/{id}", id)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + t)
                .contentType(MediaType.APPLICATION_JSON)
                .body(representation)
                .retrieve().toBodilessEntity());
    }

    public void supprimer(String id) {
        appel(t -> http.delete().uri(admin() + "/users/{id}", id)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + t)
                .retrieve().toBodilessEntity());
    }

    /** Ferme toutes les sessions SSO de l'utilisateur : ses jetons de rafraîchissement deviennent invalides. */
    public void deconnecterPartout(String id) {
        appel(t -> http.post().uri(admin() + "/users/{id}/logout", id)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + t)
                .retrieve().toBodilessEntity());
    }

    public List<String> rolesRealm(String id) {
        List<Map<String, Object>> res = appel(t -> http.get().uri(admin() + "/users/{id}/role-mappings/realm", id)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + t)
                .retrieve().body(LISTE));
        return res == null ? List.of() : res.stream().map(r -> String.valueOf(r.get("name"))).toList();
    }

    public void ajouterRolesRealm(String id, List<String> roles) {
        List<Map<String, Object>> representations = roles.stream()
                .map(nom -> appel(t -> http.get().uri(admin() + "/roles/{nom}", nom)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + t)
                        .retrieve().body(OBJET)))
                .toList();
        appel(t -> http.post().uri(admin() + "/users/{id}/role-mappings/realm", id)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + t)
                .contentType(MediaType.APPLICATION_JSON)
                .body(representations)
                .retrieve().toBodilessEntity());
    }

    // ---------------------------------------------------------------- erreurs

    /** Traduit les erreurs réseau/HTTP de Keycloak en erreurs API lisibles (sans détail technique). */
    private static <T> T enveloppe(Supplier<T> s) {
        try {
            return s.get();
        } catch (HttpClientErrorException.Unauthorized e) {
            throw e;
        } catch (HttpClientErrorException.Conflict e) {
            throw ApiException.conflit("AGENT_EXISTANT", "Un compte existe déjà avec cet identifiant ou cet email.");
        } catch (HttpClientErrorException.NotFound e) {
            throw ApiException.introuvable("AGENT_INTROUVABLE", "Compte introuvable dans l'annuaire d'identité.");
        } catch (RestClientResponseException e) {
            if (e.getStatusCode().isSameCodeAs(HttpStatus.BAD_REQUEST)) {
                throw ApiException.invalide("KEYCLOAK_REFUS", "Le service d'identité a refusé la requête (données invalides).");
            }
            throw ApiException.serviceIndisponible("Le service d'identité (Keycloak) a renvoyé une erreur.");
        } catch (ResourceAccessException e) {
            throw ApiException.serviceIndisponible("Le service d'identité (Keycloak) est injoignable.");
        }
    }
}
