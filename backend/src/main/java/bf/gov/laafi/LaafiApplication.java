package bf.gov.laafi;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

/**
 * Backend « console DGTD » de Laafi.
 * Rôle : administrer les comptes (Keycloak + Synapse), tenir le journal probant des accusés
 * de lecture et le journal d'audit. Il ne voit JAMAIS le contenu des messages :
 * ceux-ci sont chiffrés de bout en bout (Olm/Megolm) entre les clients.
 */
@SpringBootApplication
@ConfigurationPropertiesScan
public class LaafiApplication {

    public static void main(String[] args) {
        SpringApplication.run(LaafiApplication.class, args);
    }
}
