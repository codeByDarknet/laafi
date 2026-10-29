package bf.gov.laafi.keycloak;

import java.time.Instant;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Utilisateur Keycloak (UserRepresentation). On conserve la représentation brute pour la renvoyer
 * intacte lors d'une mise à jour (PUT), afin de ne pas effacer d'attributs par mégarde.
 */
public record UtilisateurKeycloak(Map<String, Object> brut) {

    public String id() {
        return (String) brut.get("id");
    }

    public String username() {
        return (String) brut.get("username");
    }

    public String prenom() {
        return (String) brut.get("firstName");
    }

    public String nom() {
        return (String) brut.get("lastName");
    }

    public String email() {
        return (String) brut.get("email");
    }

    public boolean actif() {
        return Boolean.TRUE.equals(brut.get("enabled"));
    }

    public Instant creeLe() {
        return brut.get("createdTimestamp") instanceof Number n ? Instant.ofEpochMilli(n.longValue()) : null;
    }

    @SuppressWarnings("unchecked")
    public Map<String, List<String>> attributs() {
        Object a = brut.get("attributes");
        return a instanceof Map<?, ?> m ? (Map<String, List<String>>) m : Collections.emptyMap();
    }

    public String attribut(String nom) {
        List<String> valeurs = attributs().get(nom);
        return valeurs == null || valeurs.isEmpty() ? null : valeurs.get(0);
    }

    public String ministere() {
        return attribut("ministere");
    }

    public boolean enrole() {
        return "true".equals(attribut("enrole"));
    }

    public String nomComplet() {
        String p = prenom() == null ? "" : prenom();
        String n = nom() == null ? "" : nom();
        return (p + " " + n).trim();
    }

    /**
     * Représentation minimale pour un PUT : on renvoie TOUS les attributs existants (Keycloak remplace la
     * liste complète), en ne changeant que "enabled" et l'attribut "enrole" (lu par Synapse via le claim
     * laafi_enrole : sans lui, la connexion SSO à la messagerie est refusée).
     */
    public Map<String, Object> pourMiseAJour(boolean actif, boolean enrole) {
        Map<String, Object> rep = new LinkedHashMap<>();
        rep.put("username", username());
        rep.put("firstName", prenom());
        rep.put("lastName", nom());
        if (email() != null) {
            rep.put("email", email());
        }
        rep.put("enabled", actif);
        Map<String, List<String>> attrs = new LinkedHashMap<>(attributs());
        attrs.put("enrole", List.of(String.valueOf(enrole)));
        rep.put("attributes", attrs);
        return rep;
    }
}
