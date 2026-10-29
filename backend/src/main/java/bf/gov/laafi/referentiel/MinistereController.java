package bf.gov.laafi.referentiel;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/ministeres")
public class MinistereController {

    private final ReferentielMinisteres referentiel;

    public MinistereController(ReferentielMinisteres referentiel) {
        this.referentiel = referentiel;
    }

    /** Accessible à tout utilisateur authentifié (règle globale de SecurityConfig). */
    @GetMapping
    public List<Ministere> lister() {
        return referentiel.tous();
    }
}
