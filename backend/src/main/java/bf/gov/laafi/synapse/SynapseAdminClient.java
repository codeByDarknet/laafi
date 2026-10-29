package bf.gov.laafi.synapse;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.function.Supplier;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.ClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import bf.gov.laafi.config.LaafiProperties;
import bf.gov.laafi.erreur.ApiException;

/**
 * Client de l'API d'administration de Synapse (accessible uniquement en interne : la passerelle
 * renvoie 403 sur /_synapse/admin/ depuis l'extérieur).
 *
 * Authentification : compte de service @laafi-service:laafi.local (administrateur Synapse), connecté par
 * m.login.password au démarrage (avec réessais tant que Synapse démarre). Si le jeton est refusé (401,
 * M_UNKNOWN_TOKEN), on se reconnecte et on rejoue la requête une fois.
 * On fixe un device_id constant pour ne pas créer un nouvel appareil à chaque redémarrage.
 */
@Component
public class SynapseAdminClient {

    private static final Logger LOG = LoggerFactory.getLogger(SynapseAdminClient.class);
    private static final String DEVICE_ID = "LAAFI_BACKEND";
    private static final ParameterizedTypeReference<Map<String, Object>> OBJET =
            new ParameterizedTypeReference<>() {
            };

    private final LaafiProperties.Synapse config;
    private final String serverName;
    private final RestClient http;

    private volatile String jeton;

    public SynapseAdminClient(LaafiProperties props, RestClient.Builder builder,
            ClientHttpRequestFactory requestFactory) {
        this.config = props.synapse();
        this.serverName = props.matrix().serverName();
        this.http = builder.clone().baseUrl(config.url()).requestFactory(requestFactory).build();
    }

    /** Identifiant Matrix d'un agent : @username:laafi.local */
    public String matrixId(String username) {
        return "@" + username + ":" + serverName;
    }

    // ---------------------------------------------------------------- connexion du compte de service

    /** Connexion en tâche de fond au démarrage, pour ne pas bloquer le backend si Synapse démarre plus lentement. */
    @EventListener(ApplicationReadyEvent.class)
    public void connexionAuDemarrage() {
        if (!config.connexionAuDemarrage()) {
            return;
        }
        Thread.ofVirtual().name("synapse-login").start(() -> {
            for (int i = 1; i <= config.tentativesMax(); i++) {
                try {
                    seConnecter();
                    LOG.info("Compte de service Synapse connecté (tentative {})", i);
                    return;
                } catch (RuntimeException e) {
                    LOG.warn("Synapse indisponible (tentative {}/{}), nouvel essai dans {}", i,
                            config.tentativesMax(), config.delaiReessai());
                    try {
                        Thread.sleep(config.delaiReessai());
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        return;
                    }
                }
            }
            LOG.error("Impossible de connecter le compte de service Synapse ; nouvel essai au premier appel.");
        });
    }

    synchronized String seConnecter() {
        Map<String, Object> corps = Map.of(
                "type", "m.login.password",
                "identifier", Map.of("type", "m.id.user", "user", config.serviceUser()),
                "password", config.servicePassword(),
                "device_id", DEVICE_ID,
                "initial_device_display_name", "Laafi backend (service)");
        Map<String, Object> rep = http.post().uri("/_matrix/client/v3/login")
                .contentType(MediaType.APPLICATION_JSON)
                .body(corps)
                .retrieve().body(OBJET);
        jeton = rep == null ? null : (String) rep.get("access_token");
        if (jeton == null) {
            throw new IllegalStateException("Réponse de connexion Synapse sans jeton");
        }
        return jeton;
    }

    private String jeton() {
        String j = jeton;
        return j != null ? j : seConnecter();
    }

    /** Exécute un appel admin ; sur 401 on renouvelle le jeton du compte de service puis on réessaie une fois. */
    private <T> T appel(Function<String, T> requete) {
        return enveloppe(() -> {
            try {
                return requete.apply(jeton());
            } catch (HttpClientErrorException.Unauthorized e) {
                jeton = null;
                return requete.apply(seConnecter());
            }
        });
    }

    // ---------------------------------------------------------------- Admin API

    /**
     * Pré-crée (ou met à jour) le compte Matrix et le lie à l'identité Keycloak via external_ids :
     * à sa première connexion SSO, Synapse reconnaîtra le "sub" Keycloak et ouvrira CE compte.
     */
    public void creerOuMettreAJourUtilisateur(String mxid, String nomAffiche, String subKeycloak) {
        Map<String, Object> corps = new HashMap<>();
        corps.put("displayname", nomAffiche);
        corps.put("admin", false);
        corps.put("external_ids", List.of(Map.of("auth_provider", config.idpId(), "external_id", subKeycloak)));
        appel(t -> http.put().uri("/_synapse/admin/v2/users/{mxid}", mxid)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + t)
                .contentType(MediaType.APPLICATION_JSON)
                .body(corps)
                .retrieve().toBodilessEntity());
    }

    /**
     * Réactive un compte désactivé. Synapse exige un mot de passe à la réactivation si la connexion par mot
     * de passe est active : on fournit un secret aléatoire jamais communiqué (les agents se connectent par SSO).
     */
    public void reactiver(String mxid, String nomAffiche, String subKeycloak, String motDePasseAleatoire) {
        Map<String, Object> corps = new HashMap<>();
        corps.put("deactivated", false);
        corps.put("password", motDePasseAleatoire);
        corps.put("logout_devices", true);
        corps.put("displayname", nomAffiche);
        corps.put("external_ids", List.of(Map.of("auth_provider", config.idpId(), "external_id", subKeycloak)));
        appel(t -> http.put().uri("/_synapse/admin/v2/users/{mxid}", mxid)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + t)
                .contentType(MediaType.APPLICATION_JSON)
                .body(corps)
                .retrieve().toBodilessEntity());
    }

    /**
     * Révocation totale côté Matrix : désactive le compte, supprime appareils et jetons d'accès, et le fait
     * quitter tous les salons. Les autres membres font alors tourner leur clé Megolm : l'agent révoqué
     * ne peut déchiffrer aucun nouveau message. erase=false : on conserve l'historique (archivage légal).
     */
    public void desactiver(String mxid) {
        appel(t -> http.post().uri("/_synapse/admin/v1/deactivate/{mxid}", mxid)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + t)
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("erase", false))
                .retrieve().toBodilessEntity());
    }

    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> appareils(String mxid) {
        Map<String, Object> rep = appel(t -> http.get().uri("/_synapse/admin/v2/users/{mxid}/devices", mxid)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + t)
                .retrieve().body(OBJET));
        Object devices = rep == null ? null : rep.get("devices");
        return devices instanceof List<?> l ? (List<Map<String, Object>>) l : List.of();
    }

    /** Supprime tous les appareils (et donc leurs jetons d'accès et clés E2EE) de l'utilisateur. Renvoie le nombre supprimé. */
    public int supprimerTousLesAppareils(String mxid) {
        List<String> ids = appareils(mxid).stream().map(d -> String.valueOf(d.get("device_id"))).toList();
        if (ids.isEmpty()) {
            return 0;
        }
        appel(t -> http.post().uri("/_synapse/admin/v2/users/{mxid}/delete_devices", mxid)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + t)
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("devices", ids))
                .retrieve().toBodilessEntity());
        return ids.size();
    }

    /** Liste des membres (identifiants Matrix) d'un salon — métadonnée, jamais de contenu. */
    @SuppressWarnings("unchecked")
    public List<String> membresDuSalon(String roomId) {
        try {
            Map<String, Object> rep = appel(t -> http.get().uri("/_synapse/admin/v1/rooms/{roomId}/members", roomId)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + t)
                    .retrieve().body(OBJET));
            Object membres = rep == null ? null : rep.get("members");
            return membres instanceof List<?> l ? (List<String>) l : List.of();
        } catch (ApiException e) {
            if (e.getStatut().value() == 404) {
                return List.of();
            }
            throw e;
        }
    }

    private static <T> T enveloppe(Supplier<T> s) {
        try {
            return s.get();
        } catch (HttpClientErrorException.NotFound e) {
            throw ApiException.introuvable("MATRIX_INTROUVABLE", "Ressource introuvable sur le serveur Matrix.");
        } catch (RestClientResponseException e) {
            throw ApiException.serviceIndisponible("Le serveur de messagerie (Synapse) a renvoyé une erreur.");
        } catch (ResourceAccessException e) {
            throw ApiException.serviceIndisponible("Le serveur de messagerie (Synapse) est injoignable.");
        } catch (IllegalStateException e) {
            throw ApiException.serviceIndisponible("Connexion du compte de service Synapse impossible.");
        }
    }
}
