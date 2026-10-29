-- Politiques par défaut (contrat §6). Modifiables par un super_admin via PUT /api/v1/politiques/{niveau}.
INSERT INTO politique_classification
    (niveau, libelle, transfert, copie, expiration_jours, filigrane, filigrane_nominatif, flou_hors_focus)
VALUES
    ('NORMAL',               'Normal',               'AUTORISE',          TRUE,  NULL, FALSE, FALSE, FALSE),
    ('DIFFUSION_RESTREINTE', 'Diffusion restreinte', 'INTERNE_MINISTERE', TRUE,  30,   TRUE,  FALSE, FALSE),
    ('CONFIDENTIEL',         'Confidentiel',         'INTERDIT',          FALSE, 7,    TRUE,  TRUE,  TRUE);
