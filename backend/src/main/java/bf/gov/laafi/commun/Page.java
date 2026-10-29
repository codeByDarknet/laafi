package bf.gov.laafi.commun;

import java.util.List;

/** Page de résultats renvoyée par les endpoints paginés. total peut être null si inconnu (annuaire). */
public record Page<T>(List<T> elements, int page, int taille, Long total, boolean pageSuivante) {
}
