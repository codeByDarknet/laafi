package bf.gov.laafi.politiques;

import org.springframework.data.jpa.repository.JpaRepository;

public interface PolitiqueRepository extends JpaRepository<PolitiqueClassification, Classification> {
}
