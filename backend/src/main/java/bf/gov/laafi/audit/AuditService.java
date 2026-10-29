package bf.gov.laafi.audit;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import bf.gov.laafi.commun.Page;
import bf.gov.laafi.securite.UtilisateurCourant;

@Service
public class AuditService {

    public static final int TAILLE_PAGE = 50;

    private final EvenementAuditRepository repository;

    public AuditService(EvenementAuditRepository repository) {
        this.repository = repository;
    }

    /** Transaction indépendante : l'événement est conservé même si l'appelant échoue ensuite. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public EvenementAudit journaliser(String acteur, ActionAudit action, String cible, String ministere, String motif) {
        return repository.save(new EvenementAudit(Instant.now().truncatedTo(ChronoUnit.MILLIS), acteur, action, cible,
                ministere, motif));
    }

    /** Un admin_ministere ne voit que les événements de son ministère ; le super_admin voit tout. */
    @Transactional(readOnly = true)
    public Page<EvenementAudit> consulter(UtilisateurCourant demandeur, int page) {
        var pageable = PageRequest.of(Math.max(0, page), TAILLE_PAGE, Sort.by(Sort.Direction.DESC, "id"));
        var resultat = demandeur.estSuperAdmin()
                ? repository.findAll(pageable)
                : repository.findByMinistere(demandeur.ministere(), pageable);
        return new Page<>(resultat.getContent(), resultat.getNumber(), resultat.getSize(), resultat.getTotalElements(),
                resultat.hasNext());
    }
}
