package bf.gov.laafi.audit;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface EvenementAuditRepository extends JpaRepository<EvenementAudit, Long> {

    Page<EvenementAudit> findByMinistere(String ministere, Pageable pageable);
}
