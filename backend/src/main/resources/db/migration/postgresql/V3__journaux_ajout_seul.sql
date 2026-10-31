-- PostgreSQL uniquement : les journaux (probant et audit) sont en AJOUT SEUL.
-- Toute tentative de UPDATE ou DELETE via l'application est refusée par la base elle-même.
-- (Un superutilisateur peut toujours désactiver le déclencheur : c'est pourquoi la chaîne de hachage
--  et la signature Ed25519 permettent en plus de DÉTECTER toute falsification.)
CREATE OR REPLACE FUNCTION laafi_refuser_modification() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'Journal en ajout seul : % interdit sur %', TG_OP, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_accuse_ajout_seul
    BEFORE UPDATE OR DELETE ON accuse_lecture
    FOR EACH ROW EXECUTE FUNCTION laafi_refuser_modification();

CREATE TRIGGER trg_audit_ajout_seul
    BEFORE UPDATE OR DELETE ON evenement_audit
    FOR EACH ROW EXECUTE FUNCTION laafi_refuser_modification();
