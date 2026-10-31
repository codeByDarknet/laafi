package bf.gov.laafi.accuses;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface AccuseLectureRepository extends JpaRepository<AccuseLecture, Long> {

    Optional<AccuseLecture> findTopByOrderByIdDesc();

    Optional<AccuseLecture> findByEventIdAndAgent(String eventId, String agent);

    List<AccuseLecture> findByEventIdOrderByIdAsc(String eventId);

    List<AccuseLecture> findAllByOrderByIdAsc();
}
