package bf.gov.laafi.commun;

import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Healthcheck public minimal : ne révèle ni version ni état des dépendances. */
@RestController
public class SanteController {

    @GetMapping("/api/v1/sante")
    public Map<String, String> sante() {
        return Map.of("statut", "OK");
    }
}
