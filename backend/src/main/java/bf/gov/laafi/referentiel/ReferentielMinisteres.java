package bf.gov.laafi.referentiel;

import java.io.IOException;
import java.io.InputStream;
import java.util.List;

import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import bf.gov.laafi.erreur.ApiException;

/** Référentiel des ministères (fichier ministeres.json embarqué, mêmes codes que le contrat §3). */
@Service
public class ReferentielMinisteres {

    private final List<Ministere> ministeres;

    public ReferentielMinisteres(ObjectMapper mapper) throws IOException {
        try (InputStream in = new ClassPathResource("ministeres.json").getInputStream()) {
            this.ministeres = List.copyOf(mapper.readValue(in, new TypeReference<List<Ministere>>() {
            }));
        }
    }

    public List<Ministere> tous() {
        return ministeres;
    }

    public boolean existe(String code) {
        return code != null && ministeres.stream().anyMatch(m -> m.code().equals(code));
    }

    public void verifierExiste(String code) {
        if (!existe(code)) {
            throw ApiException.invalide("MINISTERE_INCONNU", "Code ministère inconnu : " + code);
        }
    }
}
