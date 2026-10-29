package bf.gov.laafi.canaux;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface CanalRepository extends JpaRepository<CanalInstitutionnel, Long> {

    List<CanalInstitutionnel> findAllByOrderByMinistereAscNomAsc();

    List<CanalInstitutionnel> findByMinistereOrderByNomAsc(String ministere);

    boolean existsByRoomId(String roomId);
}
