package bf.gov.laafi.accuses;

import java.util.List;
import java.util.Locale;

import org.springframework.stereotype.Service;

import bf.gov.laafi.erreur.ApiException;
import bf.gov.laafi.securite.UtilisateurCourant;
import bf.gov.laafi.synapse.SynapseAdminClient;

/**
 * Contrôle d'accès autour du journal probant : seul un MEMBRE du salon (vérifié auprès de Synapse) peut
 * accuser réception d'une instruction ou consulter les accusés de ce salon. Le super_admin peut consulter.
 */
@Service
public class AccuseService {

    private final JournalProbant journal;
    private final SynapseAdminClient synapse;

    public AccuseService(JournalProbant journal, SynapseAdminClient synapse) {
        this.journal = journal;
        this.synapse = synapse;
    }

    public Preuve accuserReception(UtilisateurCourant agent, AccuseRequete req) {
        verifierMembre(agent, req.roomId(), false);
        AccuseLecture a = journal.ajouter(req.roomId(), req.eventId(), agent.username(),
                req.empreinte().toLowerCase(Locale.ROOT));
        return journal.preuve(a);
    }

    public List<Preuve.Entree> lister(UtilisateurCourant demandeur, String eventId) {
        List<AccuseLecture> accuses = journal.parEvenement(eventId);
        if (accuses.isEmpty()) {
            return List.of();
        }
        verifierMembre(demandeur, accuses.get(0).getRoomId(), true);
        return accuses.stream()
                .map(a -> new Preuve.Entree(a.getId(), a.getRoomId(), a.getEventId(), a.getAgent(), a.getEmpreinte(),
                        a.getHorodatage()))
                .toList();
    }

    public Preuve preuve(UtilisateurCourant demandeur, long id) {
        AccuseLecture a = journal.trouver(id)
                .orElseThrow(() -> ApiException.introuvable("ACCUSE_INTROUVABLE", "Accusé de lecture introuvable."));
        if (!a.getAgent().equals(demandeur.username())) {
            verifierMembre(demandeur, a.getRoomId(), true);
        }
        return journal.preuve(a);
    }

    private void verifierMembre(UtilisateurCourant u, String roomId, boolean superAdminAutorise) {
        if (superAdminAutorise && u.estSuperAdmin()) {
            return;
        }
        if (!synapse.membresDuSalon(roomId).contains(synapse.matrixId(u.username()))) {
            throw ApiException.interdit("NON_MEMBRE_SALON", "Vous n'êtes pas membre de ce salon.");
        }
    }
}
