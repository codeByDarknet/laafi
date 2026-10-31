package bf.gov.laafi.agents;

import java.security.SecureRandom;
import java.text.Normalizer;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import bf.gov.laafi.agents.Dtos.AgentDetail;
import bf.gov.laafi.agents.Dtos.AgentResume;
import bf.gov.laafi.agents.Dtos.Appareil;
import bf.gov.laafi.agents.Dtos.EnrolementReponse;
import bf.gov.laafi.agents.Dtos.EnrolementRequete;
import bf.gov.laafi.agents.Dtos.EntreeAnnuaire;
import bf.gov.laafi.agents.Dtos.ResultatOperation;
import bf.gov.laafi.audit.ActionAudit;
import bf.gov.laafi.audit.AuditService;
import bf.gov.laafi.commun.Page;
import bf.gov.laafi.erreur.ApiException;
import bf.gov.laafi.keycloak.KeycloakAdminClient;
import bf.gov.laafi.keycloak.UtilisateurKeycloak;
import bf.gov.laafi.referentiel.ReferentielMinisteres;
import bf.gov.laafi.securite.Roles;
import bf.gov.laafi.securite.UtilisateurCourant;
import bf.gov.laafi.synapse.SynapseAdminClient;

/**
 * Cycle de vie des comptes agents : enrôlement, consultation, révocations, réactivation, bouton d'urgence.
 *
 * Deux systèmes sont pilotés ensemble :
 *  - Keycloak = l'IDENTITÉ (peut-on s'authentifier ? avec quel 2e facteur ? quels rôles ?) ;
 *  - Synapse  = la MESSAGERIE (appareils, jetons d'accès Matrix, appartenance aux salons).
 *
 * Règle de PORTÉE : un admin_ministere n'agit que sur les agents de SON ministère (claim "ministere" de son
 * jeton, comparé à l'attribut "ministere" du compte ciblé dans Keycloak). Le super_admin agit partout.
 */
@Service
public class AgentService {

    private static final Logger LOG = LoggerFactory.getLogger(AgentService.class);
    private static final int TAILLE_ANNUAIRE = 20;
    private static final int MAX_LISTE_ADMIN = 500;
    private static final SecureRandom ALEA = new SecureRandom();

    private final KeycloakAdminClient keycloak;
    private final SynapseAdminClient synapse;
    private final EtatAgentRepository etats;
    private final AuditService audit;
    private final ReferentielMinisteres ministeres;

    public AgentService(KeycloakAdminClient keycloak, SynapseAdminClient synapse, EtatAgentRepository etats,
            AuditService audit, ReferentielMinisteres ministeres) {
        this.keycloak = keycloak;
        this.synapse = synapse;
        this.etats = etats;
        this.audit = audit;
        this.ministeres = ministeres;
    }

    // ================================================================= contrôle de portée

    /**
     * Vérifie que l'administrateur a le droit d'agir sur ce compte.
     * Un admin_ministere sans claim "ministere" n'a aucun périmètre (refus systématique).
     */
    void verifierPerimetre(UtilisateurCourant admin, UtilisateurKeycloak cible) {
        if (admin.estSuperAdmin()) {
            return;
        }
        if (admin.ministere() == null || !admin.ministere().equals(cible.ministere())) {
            throw ApiException.interdit("HORS_PERIMETRE",
                    "Cet agent n'appartient pas à votre ministère : action non autorisée.");
        }
    }

    /** Un admin_ministere ne peut pas modifier un compte super_admin (même s'il est dans son ministère). */
    private void verifierPasSuperAdmin(UtilisateurCourant admin, UtilisateurKeycloak cible) {
        if (!admin.estSuperAdmin() && keycloak.rolesRealm(cible.id()).contains(Roles.SUPER_ADMIN)) {
            throw ApiException.interdit("HORS_PERIMETRE", "Seul un super administrateur peut agir sur ce compte.");
        }
    }

    private UtilisateurKeycloak trouver(String username) {
        UtilisateurKeycloak u = keycloak.trouverParUsername(username);
        if (u == null) {
            throw ApiException.introuvable("AGENT_INTROUVABLE", "Agent introuvable : " + username);
        }
        return u;
    }

    // ================================================================= consultation

    public Page<EntreeAnnuaire> annuaire(String texte, String ministere, int page) {
        int p = Math.max(0, page);
        // Seuls les comptes actifs ET enrôlés figurent dans l'annuaire officiel.
        String filtre = "enrole:true" + (ministere == null || ministere.isBlank() ? "" : " ministere:" + ministere);
        List<UtilisateurKeycloak> res = keycloak.rechercher(texte, filtre, true, p * TAILLE_ANNUAIRE,
                TAILLE_ANNUAIRE + 1);
        boolean suivante = res.size() > TAILLE_ANNUAIRE;
        List<EntreeAnnuaire> elements = res.stream()
                .limit(TAILLE_ANNUAIRE)
                .filter(u -> u.actif() && u.enrole())
                .map(u -> new EntreeAnnuaire(synapse.matrixId(u.username()), u.username(), u.nomComplet(),
                        u.ministere(), u.attribut("direction"), u.attribut("fonction")))
                .toList();
        return new Page<>(elements, p, TAILLE_ANNUAIRE, null, suivante);
    }

    public List<AgentResume> lister(UtilisateurCourant admin, String texte, String ministere, StatutAgent statut) {
        String perimetre = ministere;
        if (!admin.estSuperAdmin()) {
            if (ministere != null && !ministere.isBlank() && !ministere.equals(admin.ministere())) {
                throw ApiException.interdit("HORS_PERIMETRE", "Vous ne pouvez consulter que les agents de votre ministère.");
            }
            perimetre = admin.ministere();
            if (perimetre == null) {
                throw ApiException.interdit("HORS_PERIMETRE", "Aucun ministère associé à votre compte.");
            }
        }
        String filtre = perimetre == null || perimetre.isBlank() ? null : "ministere:" + perimetre;
        String filtreFinal = perimetre;
        List<UtilisateurKeycloak> comptes = keycloak.rechercher(texte, filtre, null, 0, MAX_LISTE_ADMIN).stream()
                .filter(u -> !u.username().startsWith("service-account-"))
                // Double contrôle côté backend : on ne fait pas aveuglément confiance au filtrage distant.
                .filter(u -> filtreFinal == null || filtreFinal.isBlank() || filtreFinal.equals(u.ministere()))
                .toList();
        Map<String, StatutAgent> statuts = statutsLocaux(comptes.stream().map(UtilisateurKeycloak::username).toList());
        return comptes.stream()
                .map(u -> resume(u, statuts))
                .filter(r -> statut == null || r.statut() == statut)
                .toList();
    }

    public AgentDetail detail(UtilisateurCourant admin, String username) {
        UtilisateurKeycloak cible = trouver(username);
        verifierPerimetre(admin, cible);
        List<String> roles = keycloak.rolesRealm(cible.id()).stream()
                .filter(r -> List.of(Roles.AGENT, Roles.CHEF_SERVICE, Roles.ADMIN_MINISTERE, Roles.SUPER_ADMIN).contains(r))
                .toList();
        List<Appareil> appareils;
        try {
            appareils = synapse.appareils(synapse.matrixId(username)).stream()
                    .map(d -> new Appareil(String.valueOf(d.get("device_id")), (String) d.get("display_name"),
                            d.get("last_seen_ts") instanceof Number n ? Instant.ofEpochMilli(n.longValue()) : null))
                    .toList();
        } catch (ApiException e) {
            if (e.getStatut().value() != 404) {
                throw e;
            }
            appareils = List.of(); // compte Matrix pas encore créé (jamais connecté)
        }
        return new AgentDetail(resume(cible, statutsLocaux(List.of(username))), roles, appareils);
    }

    // ================================================================= enrôlement

    /**
     * Enrôlement d'un agent :
     *  1. création du compte Keycloak avec ses attributs, enrole=true, un mot de passe TEMPORAIRE et deux
     *     actions obligatoires à la 1re connexion : configurer le TOTP (2FA) et changer le mot de passe ;
     *  2. attribution des rôles realm ;
     *  3. pré-création du compte Synapse lié à l'identité Keycloak (external_ids = sub Keycloak).
     * Si Synapse échoue, on supprime le compte Keycloak (compensation) pour ne pas laisser d'état incohérent.
     */
    public EnrolementReponse enroler(UtilisateurCourant admin, EnrolementRequete req) {
        String ministere = req.ministere() == null || req.ministere().isBlank() ? admin.ministere() : req.ministere();
        ministeres.verifierExiste(ministere);
        if (!admin.estSuperAdmin() && !ministere.equals(admin.ministere())) {
            throw ApiException.interdit("HORS_PERIMETRE", "Vous ne pouvez enrôler que des agents de votre ministère.");
        }
        List<String> roles = rolesAutorises(admin, req.roles());
        String username = req.username() != null && !req.username().isBlank()
                ? req.username()
                : genererUsername(req.prenom(), req.nom());
        if (keycloak.trouverParUsername(username) != null) {
            throw ApiException.conflit("AGENT_EXISTANT", "L'identifiant " + username + " est déjà utilisé.");
        }
        String motDePasse = motDePasseTemporaire();

        Map<String, List<String>> attributs = new LinkedHashMap<>();
        attributs.put("ministere", List.of(ministere));
        if (req.direction() != null && !req.direction().isBlank()) {
            attributs.put("direction", List.of(req.direction().trim()));
        }
        attributs.put("fonction", List.of(req.fonction().trim()));
        attributs.put("matricule", List.of(req.matricule().trim()));
        attributs.put("enrole", List.of("true"));

        Map<String, Object> representation = new LinkedHashMap<>();
        representation.put("username", username);
        representation.put("firstName", req.prenom().trim());
        representation.put("lastName", req.nom().trim());
        if (req.email() != null && !req.email().isBlank()) {
            representation.put("email", req.email().trim());
            representation.put("emailVerified", true);
        }
        representation.put("enabled", true);
        representation.put("attributes", attributs);
        representation.put("credentials", List.of(Map.of("type", "password", "value", motDePasse, "temporary", true)));
        representation.put("requiredActions", List.of("CONFIGURE_TOTP", "UPDATE_PASSWORD"));

        String sub = keycloak.creer(representation);
        String mxid = synapse.matrixId(username);
        try {
            keycloak.ajouterRolesRealm(sub, roles);
            synapse.creerOuMettreAJourUtilisateur(mxid, (req.prenom().trim() + " " + req.nom().trim()), sub);
        } catch (RuntimeException e) {
            LOG.warn("Enrôlement interrompu, suppression du compte Keycloak créé (compensation)");
            try {
                keycloak.supprimer(sub);
            } catch (RuntimeException ignoree) {
                LOG.error("Compensation impossible : compte Keycloak orphelin à supprimer manuellement");
            }
            throw e;
        }
        etats.save(new EtatAgent(username, StatutAgent.ACTIF, maintenant()));
        audit.journaliser(admin.username(), ActionAudit.ENROLEMENT, username, ministere,
                "Rôles : " + String.join(", ", roles));
        return new EnrolementReponse(username, mxid, motDePasse);
    }

    /** admin_ministere : agent, chef_service. super_admin : en plus admin_ministere. super_admin jamais via l'API. */
    private static List<String> rolesAutorises(UtilisateurCourant admin, List<String> demandes) {
        Set<String> permis = admin.estSuperAdmin()
                ? Set.of(Roles.AGENT, Roles.CHEF_SERVICE, Roles.ADMIN_MINISTERE)
                : Set.of(Roles.AGENT, Roles.CHEF_SERVICE);
        Set<String> roles = new LinkedHashSet<>();
        roles.add(Roles.AGENT); // tout agent enrôlé a au moins le rôle agent
        if (demandes != null) {
            for (String r : demandes) {
                if (!permis.contains(r)) {
                    throw ApiException.interdit("ROLE_NON_AUTORISE", "Vous ne pouvez pas attribuer le rôle : " + r);
                }
                roles.add(r);
            }
        }
        return new ArrayList<>(roles);
    }

    static String genererUsername(String prenom, String nom) {
        Function<String, String> nettoyer = s -> Normalizer.normalize(s, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]", "");
        String u = nettoyer.apply(prenom) + "." + nettoyer.apply(nom);
        if (u.length() < 3 || u.startsWith(".") || u.endsWith(".")) {
            throw ApiException.invalide("USERNAME_INVALIDE", "Impossible de dériver un identifiant : précisez « username ».");
        }
        return u;
    }

    /** Mot de passe temporaire aléatoire (SecureRandom), à changer obligatoirement à la 1re connexion. */
    static String motDePasseTemporaire() {
        String maj = "ABCDEFGHJKLMNPQRSTUVWXYZ";
        String min = "abcdefghijkmnpqrstuvwxyz";
        String chiffres = "23456789";
        String speciaux = "!@#%*+-";
        String tous = maj + min + chiffres + speciaux;
        List<Character> c = new ArrayList<>();
        c.add(maj.charAt(ALEA.nextInt(maj.length())));
        c.add(min.charAt(ALEA.nextInt(min.length())));
        c.add(chiffres.charAt(ALEA.nextInt(chiffres.length())));
        c.add(speciaux.charAt(ALEA.nextInt(speciaux.length())));
        while (c.size() < 16) {
            c.add(tous.charAt(ALEA.nextInt(tous.length())));
        }
        Collections.shuffle(c, ALEA);
        return c.stream().map(String::valueOf).collect(Collectors.joining());
    }

    // ================================================================= révocations

    /**
     * RÉVOCATION TOTALE (départ, faute, compromission). Ordre volontaire :
     *  1. Keycloak : compte désactivé + enrole=false → plus aucune nouvelle authentification possible ;
     *  2. Keycloak : fermeture de toutes les sessions SSO → impossible de se reconnecter silencieusement ;
     *  3. Synapse : désactivation → suppression de tous les appareils et jetons d'accès, départ de tous les
     *     salons. Les clients restants font tourner leur clé Megolm : l'agent ne peut lire AUCUN nouveau message.
     * Côté navigateur de l'agent révoqué, le client détecte M_UNKNOWN_TOKEN et efface ses données locales.
     */
    public ResultatOperation revoquer(UtilisateurCourant admin, String username, String motif) {
        UtilisateurKeycloak cible = trouver(username);
        verifierPerimetre(admin, cible);
        if (cible.username().equals(admin.username())) {
            throw ApiException.invalide("AUTO_REVOCATION", "Vous ne pouvez pas révoquer votre propre compte.");
        }
        verifierPasSuperAdmin(admin, cible);

        keycloak.mettreAJour(cible.id(), cible.pourMiseAJour(false, false));
        keycloak.deconnecterPartout(cible.id());
        String mxid = synapse.matrixId(cible.username());
        sansErreurSiAbsentDeMatrix(() -> synapse.desactiver(mxid));

        etats.save(new EtatAgent(cible.username(), StatutAgent.REVOQUE, maintenant()));
        audit.journaliser(admin.username(), ActionAudit.REVOCATION_TOTALE, cible.username(), cible.ministere(), motif);
        LOG.info("Révocation totale effectuée");
        return new ResultatOperation(cible.username(), mxid, StatutAgent.REVOQUE, null,
                "Compte révoqué : identité désactivée, sessions fermées, compte de messagerie désactivé.");
    }

    /**
     * RÉVOCATION DES APPAREILS (perte ou vol du téléphone) : le compte reste actif.
     * On ferme d'abord les sessions Keycloak (sinon le voleur pourrait rouvrir une session Matrix via SSO
     * sans 2e facteur), puis on supprime tous les appareils Matrix (jetons + clés E2EE de ces appareils).
     * L'agent devra se reconnecter avec mot de passe + TOTP sur un nouvel appareil.
     */
    public ResultatOperation revoquerAppareils(UtilisateurCourant admin, String username, String motif) {
        UtilisateurKeycloak cible = trouver(username);
        verifierPerimetre(admin, cible);
        verifierPasSuperAdmin(admin, cible);
        int supprimes = deconnecterEtSupprimerAppareils(cible.id(), cible.username());
        StatutAgent statut = cible.actif() ? StatutAgent.APPAREILS_REVOQUES : StatutAgent.REVOQUE;
        etats.save(new EtatAgent(cible.username(), statut, maintenant()));
        audit.journaliser(admin.username(), ActionAudit.REVOCATION_APPAREILS, cible.username(), cible.ministere(), motif);
        return new ResultatOperation(cible.username(), synapse.matrixId(cible.username()), statut, supprimes,
                "Appareils révoqués : reconnexion avec double authentification obligatoire.");
    }

    /** BOUTON D'URGENCE : l'agent lui-même déconnecte tous ses appareils (ex. téléphone confisqué). */
    public ResultatOperation urgence(UtilisateurCourant agent) {
        // Le "sub" du jeton est l'identifiant Keycloak de l'agent : pas besoin de recherche.
        int supprimes = deconnecterEtSupprimerAppareils(agent.sub(), agent.username());
        etats.save(new EtatAgent(agent.username(), StatutAgent.APPAREILS_REVOQUES, maintenant()));
        audit.journaliser(agent.username(), ActionAudit.URGENCE, agent.username(), agent.ministere(),
                "Bouton d'urgence déclenché par l'agent");
        return new ResultatOperation(agent.username(), synapse.matrixId(agent.username()),
                StatutAgent.APPAREILS_REVOQUES, supprimes, "Tous vos appareils ont été déconnectés.");
    }

    private int deconnecterEtSupprimerAppareils(String subKeycloak, String username) {
        keycloak.deconnecterPartout(subKeycloak);
        int[] n = {0};
        sansErreurSiAbsentDeMatrix(() -> n[0] = synapse.supprimerTousLesAppareils(synapse.matrixId(username)));
        return n[0];
    }

    /** RÉACTIVATION (super_admin uniquement) : rétablit l'identité Keycloak et le compte Matrix. */
    public ResultatOperation reactiver(UtilisateurCourant admin, String username, String motif) {
        UtilisateurKeycloak cible = trouver(username);
        keycloak.mettreAJour(cible.id(), cible.pourMiseAJour(true, true));
        String mxid = synapse.matrixId(cible.username());
        byte[] alea = new byte[32];
        ALEA.nextBytes(alea);
        String secretInutilise = java.util.HexFormat.of().formatHex(alea);
        sansErreurSiAbsentDeMatrix(() -> synapse.reactiver(mxid, cible.nomComplet(), cible.id(), secretInutilise));
        etats.save(new EtatAgent(cible.username(), StatutAgent.ACTIF, maintenant()));
        audit.journaliser(admin.username(), ActionAudit.REACTIVATION, cible.username(), cible.ministere(), motif);
        return new ResultatOperation(cible.username(), mxid, StatutAgent.ACTIF, null, "Compte réactivé.");
    }

    // ================================================================= utilitaires

    /** Un compte Keycloak peut ne pas encore exister dans Synapse (jamais connecté) : ce n'est pas une erreur ici. */
    private static void sansErreurSiAbsentDeMatrix(Runnable r) {
        try {
            r.run();
        } catch (ApiException e) {
            if (e.getStatut().value() != 404) {
                throw e;
            }
        }
    }

    private Map<String, StatutAgent> statutsLocaux(List<String> usernames) {
        return etats.findAllById(usernames).stream()
                .collect(Collectors.toMap(EtatAgent::getUsername, EtatAgent::getStatut));
    }

    private AgentResume resume(UtilisateurKeycloak u, Map<String, StatutAgent> statutsLocaux) {
        StatutAgent statut;
        if (!u.actif()) {
            statut = StatutAgent.REVOQUE; // Keycloak fait foi
        } else if (statutsLocaux.get(u.username()) == StatutAgent.APPAREILS_REVOQUES) {
            statut = StatutAgent.APPAREILS_REVOQUES;
        } else {
            statut = StatutAgent.ACTIF;
        }
        return new AgentResume(u.username(), synapse.matrixId(u.username()), u.prenom(), u.nom(), u.nomComplet(),
                u.email(), u.ministere(), u.attribut("direction"), u.attribut("fonction"), u.attribut("matricule"),
                statut, u.enrole(), u.creeLe());
    }

    private static Instant maintenant() {
        return Instant.now().truncatedTo(ChronoUnit.MILLIS);
    }
}
