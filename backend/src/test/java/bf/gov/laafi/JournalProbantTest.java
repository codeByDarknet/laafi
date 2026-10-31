package bf.gov.laafi;

import static org.assertj.core.api.Assertions.assertThat;

import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import bf.gov.laafi.accuses.AccuseLecture;
import bf.gov.laafi.accuses.JournalProbant;
import bf.gov.laafi.accuses.Preuve;
import bf.gov.laafi.accuses.RapportVerification;

/** Intégrité du journal probant : chaînage SHA-256 + signature Ed25519. */
class JournalProbantTest extends TestBase {

    private static final String EMPREINTE = "a".repeat(64);

    @Autowired
    JournalProbant journal;

    private void troisEntrees() {
        journal.ajouter("!salon:laafi.local", "$evt1", "issa.kabore", EMPREINTE);
        journal.ajouter("!salon:laafi.local", "$evt1", "awa.sawadogo", EMPREINTE);
        journal.ajouter("!salon:laafi.local", "$evt2", "issa.kabore", "b".repeat(64));
    }

    @Test
    @DisplayName("Chaîne intacte : chaque entrée référence le hash de la précédente")
    void chaineIntacte() {
        troisEntrees();
        RapportVerification r = journal.verifierChaine();
        assertThat(r.integre()).isTrue();
        assertThat(r.nombreEntrees()).isEqualTo(3);

        AccuseLecture e1 = journal.trouver(1).orElseThrow();
        AccuseLecture e2 = journal.trouver(2).orElseThrow();
        assertThat(e1.getHashPrecedent()).isEqualTo(JournalProbant.HASH_ORIGINE);
        assertThat(e2.getHashPrecedent()).isEqualTo(e1.getHashEntree());
        assertThat(r.dernierHash()).isEqualTo(journal.trouver(3).orElseThrow().getHashEntree());
    }

    @Test
    @DisplayName("Accusé idempotent : un agent n'accuse réception qu'une fois d'un même événement")
    void idempotent() {
        AccuseLecture a = journal.ajouter("!salon:laafi.local", "$evt1", "issa.kabore", EMPREINTE);
        AccuseLecture b = journal.ajouter("!salon:laafi.local", "$evt1", "issa.kabore", EMPREINTE);
        assertThat(b.getId()).isEqualTo(a.getId());
        assertThat(journal.verifierChaine().nombreEntrees()).isEqualTo(1);
    }

    @Test
    @DisplayName("Falsification d'une empreinte détectée (hash recalculé différent)")
    void falsificationContenu() {
        troisEntrees();
        jdbc.update("UPDATE accuse_lecture SET empreinte = ? WHERE id = 2", "f".repeat(64));
        RapportVerification r = journal.verifierChaine();
        assertThat(r.integre()).isFalse();
        assertThat(r.premiereEntreeInvalide()).isEqualTo(2L);
        assertThat(r.raison()).contains("hash_entree");
    }

    @Test
    @DisplayName("Falsification de l'horodatage ou de l'agent détectée")
    void falsificationAgent() {
        troisEntrees();
        jdbc.update("UPDATE accuse_lecture SET agent = 'paul.zongo' WHERE id = 1");
        assertThat(journal.verifierChaine().premiereEntreeInvalide()).isEqualTo(1L);
    }

    @Test
    @DisplayName("Réécriture complète d'une entrée (hash recalculé) : chaînage ou signature invalide")
    void falsificationAvecRecalculDuHash() {
        troisEntrees();
        AccuseLecture e2 = journal.trouver(2).orElseThrow();
        // L'attaquant recalcule un hash cohérent pour sa modification, mais ne peut pas signer sans la clé privée.
        String faux = JournalProbant.sha256Hex(JournalProbant.serialisationCanonique(e2).replace(EMPREINTE, "c".repeat(64)));
        jdbc.update("UPDATE accuse_lecture SET empreinte = ?, hash_entree = ? WHERE id = 2", "c".repeat(64), faux);
        RapportVerification r = journal.verifierChaine();
        assertThat(r.integre()).isFalse();
        assertThat(r.premiereEntreeInvalide()).isEqualTo(2L);
        assertThat(r.raison()).contains("Signature");
    }

    @Test
    @DisplayName("Suppression d'une entrée détectée")
    void suppression() {
        troisEntrees();
        jdbc.update("DELETE FROM accuse_lecture WHERE id = 2");
        RapportVerification r = journal.verifierChaine();
        assertThat(r.integre()).isFalse();
        assertThat(r.premiereEntreeInvalide()).isEqualTo(3L);
    }

    @Test
    @DisplayName("La preuve est vérifiable par un tiers avec la JCA standard (SHA-256 + Ed25519)")
    void preuveVerifiableParUnTiers() throws Exception {
        troisEntrees();
        Preuve p = journal.preuve(journal.trouver(2).orElseThrow());
        assertThat(p.verifieeParLeServeur()).isTrue();

        // 1. Le hash correspond bien à la sérialisation canonique publiée
        assertThat(JournalProbant.sha256Hex(p.serialisationCanonique())).isEqualTo(p.hashEntree());
        assertThat(p.serialisationCanonique()).contains("|awa.sawadogo|").endsWith(p.hashPrecedent());

        // 2. La signature est valide avec la clé publique fournie dans la preuve
        PublicKey cle = KeyFactory.getInstance("Ed25519")
                .generatePublic(new X509EncodedKeySpec(Base64.getDecoder().decode(p.clePublique())));
        Signature verif = Signature.getInstance("Ed25519");
        verif.initVerify(cle);
        verif.update(p.hashEntree().getBytes(java.nio.charset.StandardCharsets.UTF_8));
        assertThat(verif.verify(Base64.getDecoder().decode(p.signature()))).isTrue();

        // 3. Une seule lettre changée invalide la signature
        verif.initVerify(cle);
        verif.update(p.hashEntree().replaceFirst(".", "0".equals(p.hashEntree().substring(0, 1)) ? "1" : "0")
                .getBytes(java.nio.charset.StandardCharsets.UTF_8));
        assertThat(verif.verify(Base64.getDecoder().decode(p.signature()))).isFalse();
    }
}
