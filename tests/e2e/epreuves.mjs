// =============================================================================
// Laafi — les épreuves du jury, rejouées dans un VRAI navigateur (Chromium sans interface).
//
//   cd tests/e2e && npm ci && node epreuves.mjs
//
// Prérequis : la pile tourne (docker compose up -d), de préférence fraîchement remise à zéro
// (./scripts/reset.sh --oui && docker compose up -d) ; Chromium de Playwright dans
// ~/.cache/ms-playwright (ou variable CHROMIUM_PATH).
//
// Épreuves (docs/GUIDE-ENTRETIEN.md, §2) :
//   1. « Le serveur ne lit rien »  : message + fichier témoin, recherche dans les 3 bases et les médias ;
//   2. Révocation en pleine conversation de groupe, perte de téléphone, bouton d'urgence ;
//   3. Intrus : compte inconnu, compte non enrôlé, mauvais TOTP, m.login.password, API sans jeton ;
//   + enrôlement d'un nouvel agent, classification + accusé probant, langues, message vocal.
//
// Captures d'écran : dossier `captures/` (ou LAAFI_CAPTURES). Code de sortie 0 si tout passe.
// L'épreuve 2 réactive Issa à la fin (super.admin) : la démo reste utilisable.
// =============================================================================
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BASE,
  MOT_DE_PASSE,
  attendre,
  capture,
  codeFrais,
  connecter,
  connecterConsole,
  navigateur,
  profil,
  saisirKeycloak,
  totp,
} from './lib.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TEMOIN = process.env.TEMOIN ?? 'TEMOIN-MANGUE-2026';
const MXID = (u) => `@${u}:laafi.local`;

// ───────────────────────────── Outils ─────────────────────────────

const resultats = [];
const profilsOuverts = [];
function verifier(nom, ok, preuve = '') {
  resultats.push({ nom, ok: !!ok, preuve });
  console.log(`${ok ? '  ✔ PASS' : '  ✘ FAIL'}  ${nom}${preuve ? ` — ${preuve}` : ''}`);
  return !!ok;
}
async function etape(nom, fn) {
  console.log(`\n== ${nom} ==`);
  try {
    await fn();
  } catch (e) {
    verifier(`${nom} (exception)`, false, `${e.message.split('\n')[0]} @ ${(e.stack ?? '').split('\n').find((l) => l.includes('epreuves.mjs'))?.trim() ?? ''}`);
    for (const p of profilsOuverts) await capture(p.page, `erreur-${p.nom}`).catch(() => undefined);
  }
}

/** Commande shell dans le dépôt (docker compose …). */
function sh(cmd) {
  return execSync(cmd, { cwd: RACINE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function sql(base, requete) {
  return sh(`docker compose exec -T postgres psql -U postgres -d ${base} -At -c ${JSON.stringify(requete)}`);
}

/** Requête HTTP brute (épreuve « Intrus »). */
async function http(methode, chemin, corps, entetes = {}) {
  const r = await fetch(`${BASE}${chemin}`, {
    method: methode,
    headers: { 'Content-Type': 'application/json', ...entetes },
    body: corps ? JSON.stringify(corps) : undefined,
    redirect: 'manual',
  });
  const texte = await r.text();
  let json = null;
  try {
    json = JSON.parse(texte);
  } catch {
    /* pas du JSON */
  }
  return { statut: r.status, json, texte };
}

/** Ouvre une conversation par son nom dans la liste des salons. */
async function ouvrirSalon(page, nom) {
  await page.goto(`${BASE}/salons`);
  await page.locator('a, button', { hasText: nom }).first().click();
  await page.waitForURL(/salons\/!/, { timeout: 30_000 });
}

/** Accepte l'invitation au salon `nom` (liste des salons). */
async function accepterInvitation(page, nom) {
  await page.goto(`${BASE}/salons`);
  const invit = page.locator('li.invitation', { hasText: nom });
  await invit.waitFor({ timeout: 30_000 });
  await invit.getByRole('button', { name: 'Accepter' }).click();
  await page.waitForURL(/salons\/!/, { timeout: 30_000 });
  const ok = await page.locator('lf-composeur textarea').waitFor({ timeout: 30_000 }).then(() => true).catch(() => false);
  if (!ok) {
    // Diagnostic : que montre l'écran, et le serveur a-t-il enregistré l'entrée dans le salon ?
    const id = decodeURIComponent(page.url().split('/salons/')[1]);
    const texte = (await page.locator('main').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200);
    const etat = await page.evaluate(() => JSON.parse(localStorage.getItem('laafi.session') ?? '{}').userId);
    const membre = sql('synapse', `SELECT membership FROM local_current_membership WHERE room_id='${id}' AND user_id='${etat}'`);
    await capture(page, `invitation-bloquee-${Date.now()}`);
    if (process.env.DIAG) {
      console.log('état SDK :', await page.evaluate((rid) => {
        const c = window.__dbgClient; if (!c) return 'pas de client';
        const rooms = c.getRooms().map((r) => r.roomId.slice(0, 8) + ':' + r.getMyMembership());
        const r = c.getRoom(rid);
        const ev = r?.currentState.getStateEvents('m.room.member', c.getUserId());
        return JSON.stringify({ rooms, my: r?.getMyMembership(), sel: r?.selfMembership, memberEv: ev?.getContent()?.membership, memberId: ev?.getId(), sync: c.getSyncState(), same: r === c.store.getRoom(rid), liveMember: r?.getLiveTimeline().getState('f')?.getStateEvents('m.room.member', c.getUserId())?.getContent()?.membership, nbMembres: r?.currentState.getMembers().map((m) => m.userId.slice(1, 5) + ':' + m.membership), errs: window.__dbgErr });
      }, id));
      await attendre(20_000);
      console.log('après 20 s :', await page.locator('lf-composeur textarea').count());
      await page.reload();
      console.log('après rechargement :', await page.locator('lf-composeur textarea').waitFor({ timeout: 30_000 }).then(() => 'composeur OK').catch(() => 'toujours bloqué'));
    }
    throw new Error(`composeur absent après « Accepter » (serveur : ${membre}) — écran : ${texte}`);
  }
}

async function envoyerTexte(page, texte) {
  const zone = page.locator('lf-composeur textarea');
  await zone.fill(texte);
  await zone.press('Enter');
}

/** Attend qu'un texte apparaisse dans le fil de la conversation ouverte. */
async function voit(page, texte, delai = 20_000) {
  return page
    .locator('.fil, main', { hasText: texte })
    .first()
    .waitFor({ timeout: delai })
    .then(() => true)
    .catch(() => false);
}

// ───────────────────────────── Scénario ─────────────────────────────

const navig = await navigateur();
const awa = await profil(navig, 'awa');
const issa = await profil(navig, 'issa');
const rasmataClient = await profil(navig, 'rasmata');
profilsOuverts.push(awa, issa, rasmataClient);
const SALON = `Riposte paludisme – Kaya ${new Date().toISOString().slice(11, 19)}`;
let roomId = null;

await etape('Épreuve 1 — « Le serveur ne lit rien »', async () => {
  await connecter(awa, 'awa.sawadogo');
  await connecter(issa, 'issa.kabore');
  await connecter(rasmataClient, 'admin.sante');
  verifier('Connexion SSO (mot de passe + TOTP) de 3 agents', true, 'awa.sawadogo, issa.kabore, admin.sante');
  await capture(awa.page, '01-awa-salons');

  // Awa crée le groupe chiffré et invite Issa et Rasmata.
  const pa = awa.page;
  await pa.goto(`${BASE}/nouveau`);
  await pa.getByRole('tab', { name: /Groupe/ }).click();
  await pa.fill('#nom-salon', SALON);
  for (const qui of ['Issa', 'Rasmata']) {
    await pa.locator('lf-recherche-agents input[type=search]').fill(qui);
    await pa.locator('lf-recherche-agents .lf-list__item', { hasText: qui }).first().click();
  }
  await capture(pa, '02-awa-nouveau-groupe');
  await pa.getByRole('button', { name: /Créer le groupe/ }).click();
  await pa.waitForURL(/salons\/!/);
  roomId = decodeURIComponent(pa.url().split('/salons/')[1]);
  await accepterInvitation(issa.page, SALON);
  await accepterInvitation(rasmataClient.page, SALON);

  const chiffrement = sql('synapse', `SELECT json FROM event_json WHERE room_id='${roomId}' AND event_id IN (SELECT event_id FROM events WHERE type='m.room.encryption')`);
  verifier('Salon chiffré dès sa création (m.room.encryption dans l’état initial)', chiffrement.includes('m.megolm.v1.aes-sha2'), roomId);

  await attendre(2000);
  await envoyerTexte(pa, `Réunion de riposte demain 8 h. Mot témoin : ${TEMOIN}`);
  await pa.locator('lf-composeur input[type=file]:not([accept])').setInputFiles({
    name: 'rapport-temoin.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(`Rapport confidentiel. Mot témoin : ${TEMOIN}\n`),
  });
  verifier('Issa reçoit et déchiffre le message', await voit(issa.page, TEMOIN));
  await issa.page.locator('.fil, main').getByText('rapport-temoin.txt').first().waitFor({ timeout: 30_000 });
  await capture(pa, '03-awa-envoi');
  await capture(issa.page, '04-issa-reception');

  // Issa télécharge le fichier : le client le déchiffre localement.
  const [telechargement] = await Promise.all([
    issa.page.waitForEvent('download', { timeout: 30_000 }),
    issa.page.locator('lf-piece-jointe', { hasText: 'rapport-temoin.txt' }).getByRole('button').last().click(),
  ]);
  const chemin = await telechargement.path();
  verifier('Issa télécharge et déchiffre le fichier', readFileSync(chemin, 'utf8').includes(TEMOIN), telechargement.suggestedFilename());

  await envoyerTexte(issa.page, `Bien reçu, ${TEMOIN} noté.`);
  verifier('Awa reçoit la réponse d’Issa', await voit(pa, 'Bien reçu'));
  await attendre(2000);

  // Côté serveur : le mot témoin n'est nulle part.
  const comptes = sh(
    `docker compose exec -T postgres sh -c 'for db in synapse keycloak laafi; do printf "%s=" "$db"; pg_dump -U postgres "$db" | grep -ci "${TEMOIN}"; done' || true`,
  );
  verifier('pg_dump des 3 bases (synapse, keycloak, laafi) : 0 occurrence', /synapse=0\s+keycloak=0\s+laafi=0/.test(comptes), comptes.replace(/\n/g, ' '));
  const medias = sh(`docker compose exec -T synapse sh -c 'grep -rIl "${TEMOIN}" /data/media_store | wc -l; find /data/media_store -type f | wc -l'`).split('\n');
  verifier('Stockage des médias : 0 fichier contenant le mot témoin', medias[0] === '0' && +medias[1] > 0, `${medias[1]} fichier(s) stocké(s), ${medias[0]} contenant le témoin`);
  const types = sql('synapse', `SELECT DISTINCT type FROM events WHERE room_id='${roomId}' AND type LIKE 'm.room.%' AND state_key IS NULL`);
  verifier('Les messages sont stockés en m.room.encrypted uniquement', types === 'm.room.encrypted', types.replace(/\n/g, ', '));
  let script = '';
  try {
    script = sh(`./scripts/verifier-serveur-aveugle.sh "${TEMOIN}" 2>&1`);
    verifier('scripts/verifier-serveur-aveugle.sh (code de sortie 0)', true);
  } catch (e) {
    script = String(e.stdout);
    verifier('scripts/verifier-serveur-aveugle.sh (code de sortie 0)', false, script.split('\n').filter((l) => /TROUVÉ/.test(l)).join(' '));
  }
});

if (process.env.JUSQUA === '1') await fin();

// ─────────────── Épreuve 2 : révocation pendant une conversation de groupe ───────────────
const rasmataConsole = await profil(navig, 'rasmata-console');
profilsOuverts.push(rasmataConsole);

/** Fiche agent dans la console, puis action (dialogue de confirmation). */
async function ficheAgent(page, username) {
  await page.goto(`${BASE}/console/agents/${username}`);
  await page.locator('h1', { hasText: /\w/ }).first().waitFor({ timeout: 30_000 });
  await page.locator('#t-appareils').waitFor({ timeout: 30_000 });
}

/** Attend l'écran « Accès révoqué » sur un client ; renvoie le délai en secondes. */
async function attendreRevocation(page, depart, delai = 60_000) {
  await page.waitForURL(/acces-revoque/, { timeout: delai });
  return ((Date.now() - depart) / 1000).toFixed(1);
}

function etatSynapse(username) {
  return {
    desactive: sql('synapse', `SELECT deactivated FROM users WHERE name='${MXID(username)}'`),
    appareils: +sql('synapse', `SELECT count(*) FROM devices WHERE user_id='${MXID(username)}' AND NOT hidden`),
    jetons: +sql('synapse', `SELECT count(*) FROM access_tokens WHERE user_id='${MXID(username)}'`),
  };
}

await etape('Épreuve 2 — Révocation pendant une conversation de groupe', async () => {
  const pc = rasmataConsole.page;
  await connecterConsole(rasmataConsole, 'admin.sante');
  await capture(pc, '10-console-tableau-de-bord');
  await ficheAgent(pc, 'issa.kabore');
  const nbAppareils = await pc.locator('#t-appareils ~ .lf-badge, .lf-card__header .lf-badge').first().textContent();
  await capture(pc, '11-console-fiche-issa');
  verifier('Console : fiche d’Issa avec la liste de ses appareils', +nbAppareils >= 1, `${nbAppareils?.trim()} appareil(s)`);

  // Révocation totale.
  await pc.getByRole('button', { name: "Révoquer l'agent" }).first().click();
  await pc.fill('#dr-motif', 'Épreuve jury : départ du service');
  await pc.fill('#dr-confirm', 'issa.kabore');
  await capture(pc, '12-console-dialogue-revocation');
  const depart = Date.now();
  await pc.locator('dialog[open]').getByRole('button', { name: "Révoquer l'agent" }).click();
  let delai = null;
  try {
    delai = await attendreRevocation(issa.page, depart);
  } catch {
    /* délai dépassé */
  }
  verifier('Le client ouvert d’Issa affiche « Accès révoqué »', delai !== null, delai ? `${delai} s après la confirmation` : 'aucune réaction en 60 s');
  await issa.page.waitForLoadState('networkidle').catch(() => undefined);
  await capture(issa.page, '13-issa-acces-revoque');
  await capture(pc, '14-console-issa-revoque');
  const bases = await issa.page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));
  const local = await issa.page.evaluate(() => localStorage.length);
  verifier('Données locales d’Issa effacées (IndexedDB, localStorage)', bases.filter((b) => /laafi|matrix/.test(b)).length === 0 && local === 0, `bases restantes : [${bases.join(', ')}], localStorage : ${local} clé(s)`);

  const s = etatSynapse('issa.kabore');
  verifier('Synapse : compte désactivé, 0 appareil, 0 jeton', s.desactive === '1' && s.appareils === 0 && s.jetons === 0, JSON.stringify(s));
  const statut = sql('laafi', `SELECT action || ' ' || cible FROM evenement_audit ORDER BY id DESC LIMIT 1`);
  const audit = await pc.goto(`${BASE}/console/audit`).then(() => pc.locator('table').first().waitFor({ timeout: 20_000 }).then(() => pc.locator('table').first().textContent()));
  verifier('Journal d’audit : révocation enregistrée', /issa\.kabore/.test(audit ?? '') && /[Rr]évo/.test(audit ?? ''), statut);
  await capture(pc, '15-console-audit');

  // Awa et Rasmata continuent ; nouvelle session Megolm sans Issa.
  const membres = sql('synapse', `SELECT membership FROM room_memberships m JOIN events e USING(event_id) WHERE m.room_id='${roomId}' AND m.user_id='${MXID('issa.kabore')}' ORDER BY e.stream_ordering DESC LIMIT 1`);
  verifier('Issa ne fait plus partie du groupe (membership = leave)', membres === 'leave', membres);
  const sessionsAvant = sql('synapse', `SELECT DISTINCT j.json::jsonb #>> '{content,session_id}' FROM events e JOIN event_json j USING(event_id) WHERE e.room_id='${roomId}' AND e.type='m.room.encrypted' AND e.sender='${MXID('awa.sawadogo')}'`).split('\n');
  await envoyerTexte(awa.page, 'Après le départ d’Issa : SECRET-APRES-REVOCATION');
  verifier('Rasmata reçoit le nouveau message d’Awa', await voit(rasmataClient.page, 'SECRET-APRES-REVOCATION'));
  await envoyerTexte(rasmataClient.page, 'Bien noté, on continue sans lui.');
  verifier('Awa reçoit la réponse de Rasmata', await voit(awa.page, 'on continue sans lui'));
  await capture(awa.page, '16-awa-apres-revocation');
  const sessionApres = sql('synapse', `SELECT j.json::jsonb #>> '{content,session_id}' FROM events e JOIN event_json j USING(event_id) WHERE e.room_id='${roomId}' AND e.type='m.room.encrypted' AND e.sender='${MXID('awa.sawadogo')}' ORDER BY e.stream_ordering DESC LIMIT 1`);
  verifier('Rotation Megolm : nouvelle session de chiffrement après la révocation', !sessionsAvant.includes(sessionApres), `avant ${sessionsAvant.map((x) => x.slice(0, 8)).join(',')} → après ${sessionApres.slice(0, 8)}`);
  // La clé de la nouvelle session n'a été envoyée (to-device Olm) à aucun appareil d'Issa : il n'en a plus.
  const toDevice = +sql('synapse', `SELECT count(*) FROM device_inbox WHERE user_id='${MXID('issa.kabore')}'`);
  verifier('Aucune clé envoyée vers un appareil d’Issa (device_inbox vide)', toDevice === 0, `${toDevice} message(s) en attente`);

  // Issa tente de se reconnecter.
  await issa.page.goto(`${BASE}/`);
  await issa.page.getByRole('button', { name: /Se connecter/i }).click();
  await issa.page.waitForSelector('#username');
  await issa.page.fill('#username', 'issa.kabore');
  await issa.page.fill('#password', MOT_DE_PASSE);
  await issa.page.click('#kc-login');
  await issa.page.waitForLoadState('domcontentloaded');
  const refus = await issa.page.locator('#input-error, .kc-feedback-text, .pf-m-danger, [class*=alert]').first().textContent({ timeout: 10_000 }).catch(() => '');
  await capture(issa.page, '17-issa-reconnexion-refusee');
  verifier('Issa ne peut plus se reconnecter (Keycloak refuse)', !(await issa.page.locator('#otp').isVisible()) && !/salons/.test(issa.page.url()), (refus ?? '').trim());

  // Réactivation par super.admin (remise en état de la démo).
  const superAdmin = await profil(navig, 'super-admin');
  profilsOuverts.push(superAdmin);
  await connecterConsole(superAdmin, 'super.admin');
  await ficheAgent(superAdmin.page, 'issa.kabore');
  await superAdmin.page.getByRole('button', { name: 'Réactiver' }).first().click();
  await superAdmin.page.locator('dialog[open]').getByRole('button', { name: 'Réactiver' }).click();
  await superAdmin.page.locator('dialog[open]').waitFor({ state: 'detached', timeout: 20_000 }).catch(() => undefined);
  await attendre(1500);
  await capture(superAdmin.page, '18-console-issa-reactive');
  verifier('super.admin réactive Issa', etatSynapse('issa.kabore').desactive === '0');

  // Issa revient (mot de passe + TOTP), est réinvité : il ne lit pas la période révoquée.
  await issa.ctx.clearCookies();
  await connecter(issa, 'issa.kabore');
  // Awa réinvite Issa depuis les détails du groupe (choisir l'agent = l'inviter).
  await awa.page.goto(`${BASE}/salons/${encodeURIComponent(roomId)}/details`);
  await awa.page.getByRole('button', { name: 'Inviter' }).first().click();
  await awa.page.locator('lf-recherche-agents input[type=search]').fill('Issa');
  await awa.page.locator('lf-recherche-agents .lf-list__item', { hasText: 'Issa' }).first().click();
  await accepterInvitation(issa.page, SALON);
  await attendre(4000);
  const voitSecret = await issa.page.getByText('SECRET-APRES-REVOCATION').count();
  await capture(issa.page, '19-issa-reinvite');
  verifier('Réinvité, Issa ne lit PAS les messages échangés pendant sa révocation', voitSecret === 0, `${voitSecret} occurrence(s) affichée(s)`);

  // Variante « perte de téléphone » : appareils supprimés, compte toujours actif.
  await ficheAgent(pc, 'issa.kabore');
  await pc.getByRole('button', { name: 'Révoquer les appareils' }).first().click();
  const depart2 = Date.now();
  await pc.locator('dialog[open]').getByRole('button', { name: 'Révoquer les appareils' }).click();
  let delai2 = null;
  try {
    delai2 = await attendreRevocation(issa.page, depart2);
  } catch {
    /* délai dépassé */
  }
  const s2 = etatSynapse('issa.kabore');
  verifier('Perte de téléphone : client d’Issa coupé, appareils supprimés, compte actif', delai2 !== null && s2.appareils === 0 && s2.desactive === '0', `${delai2 ?? '>60'} s ; ${JSON.stringify(s2)}`);
  await issa.ctx.clearCookies();
  await connecter(issa, 'issa.kabore');
  verifier('Perte de téléphone : reconnexion avec mot de passe ET TOTP', /salons/.test(issa.page.url()));

  // Bouton d'urgence (/me/urgence) depuis le profil d'Issa.
  await issa.page.goto(`${BASE}/profil`);
  await issa.page.getByRole('button', { name: 'Déconnecter tous mes appareils' }).click();
  await issa.page.fill('#mot-urgence', 'URGENCE');
  await capture(issa.page, '20-issa-urgence');
  await issa.page.getByRole('button', { name: 'Tout déconnecter et effacer' }).click();
  await issa.page.waitForURL(/acces-revoque/, { timeout: 30_000 });
  await capture(issa.page, '21-issa-apres-urgence');
  const s3 = etatSynapse('issa.kabore');
  const auditUrgence = sql('laafi', `SELECT count(*) FROM evenement_audit WHERE action ILIKE '%URGENCE%'`);
  verifier('Bouton d’urgence : appareils supprimés et urgence journalisée', s3.appareils === 0 && +auditUrgence >= 1, `${JSON.stringify(s3)}, audit urgence : ${auditUrgence}`);
});

if (process.env.JUSQUA === '2') await fin();

// ───────────────────── Épreuve 3 — Intrus ─────────────────────

/** kcadm dans le conteneur Keycloak (identifiants d'admin lus dans son propre environnement). */
function kcadm(args) {
  // Le script est passé sur l'entrée standard : les $KC_… sont développés DANS le conteneur.
  const script = `/opt/keycloak/bin/kcadm.sh config credentials --config /tmp/kc-e2e.cfg --server http://localhost:8080/auth --realm master --user "$KC_BOOTSTRAP_ADMIN_USERNAME" --password "$KC_BOOTSTRAP_ADMIN_PASSWORD" >/dev/null 2>&1 && /opt/keycloak/bin/kcadm.sh ${args} --config /tmp/kc-e2e.cfg`;
  return execSync('docker compose exec -T keycloak bash -s', { cwd: RACINE, input: script, encoding: 'utf8' }).trim();
}

await etape('Épreuve 3 — Intrus', async () => {
  const intrus = await profil(navig, 'intrus');
  profilsOuverts.push(intrus);
  const pi = intrus.page;

  // 1-2. Compte inconnu, et aucun lien d'inscription sur la page Keycloak.
  await pi.goto(`${BASE}/`);
  await pi.getByRole('button', { name: /Se connecter/i }).click();
  await pi.waitForSelector('#username');
  const lienInscription = await pi.locator('a', { hasText: /inscrire|register/i }).count();
  await pi.fill('#username', 'intrus');
  await pi.fill('#password', 'nimportequoi');
  await pi.click('#kc-login');
  await pi.waitForLoadState('domcontentloaded');
  const erreur1 = (await pi.getByText(/invalide/i).first().textContent({ timeout: 10_000 }).catch(() => '')).trim();
  await capture(pi, '30-intrus-inconnu');
  verifier('Compte inconnu refusé par Keycloak', /invalide|invalid/i.test(erreur1) && !/salons/.test(pi.url()), erreur1);
  verifier('Aucun lien « S’inscrire » sur la page de connexion', lienInscription === 0);

  // 3. Inscription directe sur Matrix.
  const reg = await http('POST', '/_matrix/client/v3/register', { username: 'intrus', password: 'x' });
  verifier('POST /register → 403 M_FORBIDDEN', reg.statut === 403 && reg.json?.errcode === 'M_FORBIDDEN', `${reg.statut} ${reg.json?.errcode}`);

  // 4. Contournement du SSO par mot de passe Matrix.
  const mdp = await http('POST', '/_matrix/client/v3/login', {
    type: 'm.login.password', identifier: { type: 'm.id.user', user: 'issa.kabore' }, password: MOT_DE_PASSE,
  });
  verifier('m.login.password refusé (403 M_FORBIDDEN)', mdp.statut === 403 && mdp.json?.errcode === 'M_FORBIDDEN', `${mdp.statut} ${mdp.json?.errcode} ${mdp.json?.error ?? ''}`);
  // Remarque : /login annonce encore m.login.password (nécessaire au compte de service
  // @laafi-service) ; les agents, eux, n'ont pas de mot de passe Matrix (refus ci-dessus).

  // 5. Bon mot de passe, mauvais TOTP.
  await intrus.ctx.clearCookies();
  await pi.goto(`${BASE}/`);
  await pi.getByRole('button', { name: /Se connecter/i }).click();
  await saisirKeycloak(pi, 'paul.zongo', MOT_DE_PASSE, '000000');
  const erreur5 = (await pi.getByText(/invalide/i).first().textContent({ timeout: 10_000 }).catch(() => '')).trim();
  await capture(pi, '31-intrus-mauvais-totp');
  verifier('Mauvais code TOTP refusé', /invalide|invalid/i.test(erreur5) && !/salons/.test(pi.url()), erreur5);

  // 6-7. API d'administration Synapse et API métier.
  const adm = await http('GET', '/_synapse/admin/v1/server_version');
  verifier('/_synapse/admin depuis l’extérieur → 403', adm.statut === 403, String(adm.statut));
  const api = await http('GET', '/api/v1/annuaire');
  verifier('/api/v1/annuaire sans jeton → 401', api.statut === 401, String(api.statut));
  const apiFaux = await http('GET', '/api/v1/annuaire', null, { Authorization: 'Bearer eyJhbGciOiJub25lIn0.e30.' });
  verifier('/api/v1/annuaire avec un jeton forgé → 401', apiFaux.statut === 401, String(apiFaux.statut));

  // 8. Agent réel (MEF) non invité qui tente de rejoindre le groupe par son identifiant.
  await intrus.ctx.clearCookies();
  await connecter(intrus, 'paul.zongo');
  const jeton = await pi.evaluate(() => JSON.parse(localStorage.getItem('laafi.session')).accessToken);
  const join = await http('POST', `/_matrix/client/v3/join/${encodeURIComponent(roomId)}`, {}, { Authorization: `Bearer ${jeton}` });
  verifier('Agent non invité : rejoindre le groupe → 403 M_FORBIDDEN', join.statut === 403 && join.json?.errcode === 'M_FORBIDDEN', `${join.statut} ${join.json?.errcode} ${join.json?.error ?? ''}`);
  const lire = await http('GET', `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/messages?dir=b&limit=5`, null, { Authorization: `Bearer ${jeton}` });
  verifier('Agent non invité : lire l’historique du groupe → 403', lire.statut === 403, `${lire.statut} ${lire.json?.errcode}`);

  // Compte présent dans Keycloak mais NON enrôlé (enrole=false) : Synapse refuse la session.
  const idPaul = JSON.parse(kcadm('get users -r laafi -q username=paul.zongo --fields id'))[0].id;
  kcadm(`update users/${idPaul} -r laafi -s 'attributes.enrole=["false"]'`);
  try {
    await pi.evaluate(() => localStorage.clear());
    await intrus.ctx.clearCookies();
    await pi.goto(`${BASE}/`);
    await pi.getByRole('button', { name: /Se connecter/i }).click();
    await saisirKeycloak(pi, 'paul.zongo');
    await pi.waitForLoadState('networkidle').catch(() => undefined);
    await attendre(2000);
    const texte = (await pi.locator('body').innerText()).slice(0, 300).replace(/\s+/g, ' ');
    await capture(pi, '32-non-enrole');
    verifier('Compte Keycloak non enrôlé : aucune session Matrix', !/\/salons/.test(pi.url()) && !(await pi.evaluate(() => localStorage.getItem('laafi.session'))), `${pi.url().slice(0, 90)} — « ${texte} »`);
  } finally {
    kcadm(`update users/${idPaul} -r laafi -s 'attributes.enrole=["true"]'`);
  }
  verifier('paul.zongo ré-enrôlé après le test', /"enrole" : \[ "true" \]/.test(kcadm(`get users/${idPaul} -r laafi`)));
  await intrus.ctx.close();
  profilsOuverts.splice(profilsOuverts.indexOf(intrus), 1);
});

if (process.env.JUSQUA === '3') await fin();

// ───────────────────── Vérifications complémentaires ─────────────────────

await etape('Classification « Confidentiel » + instruction avec accusé probant', async () => {
  const pr = rasmataClient.page;
  const pa = awa.page;
  const INSTR = `Instruction de service ${Date.now()} : stock ACT à vérifier`;
  await pr.goto(`${BASE}/salons/${encodeURIComponent(roomId)}`);
  await pr.locator('lf-composeur textarea').waitFor();
  await pr.getByRole('button', { name: 'Options du message' }).click();
  await pr.locator('label.niveau', { hasText: 'Confidentiel' }).click();
  await pr.locator('label.interrupteur input[type=checkbox]').check();
  await capture(pr, '40-rasmata-options-confidentiel');
  await envoyerTexte(pr, INSTR);

  await pa.goto(`${BASE}/salons/${encodeURIComponent(roomId)}`);
  verifier('Awa reçoit l’instruction confidentielle', await voit(pa, INSTR, 30_000));
  const bandeau = await pa.locator('.bandeau[data-cls=CONFIDENTIEL]').textContent({ timeout: 10_000 }).catch(() => '');
  const filigrane = await pa.locator('.lf-watermark').getAttribute('data-watermark').catch(() => null);
  const flou = await pa.locator('.lf-blur-guard').count();
  await capture(pa, '41-awa-confidentiel');
  verifier('Bandeau Confidentiel, filigrane nominatif et flou hors focus', !!bandeau && /Awa|Sawadogo/.test(filigrane ?? '') && flou > 0, `filigrane « ${filigrane} » ; flou : ${flou}`);

  await pa.locator('lf-message', { hasText: INSTR }).getByRole('button', { name: 'J\'en ai pris connaissance' }).click();
  const recu = await pa.getByText('Vous avez pris connaissance de cette instruction').first().waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
  await capture(pa, '42-awa-accuse');
  const nbAccuses = sql('laafi', 'SELECT count(*) FROM accuse_lecture');
  verifier('Accusé de lecture enregistré (backend)', recu && +nbAccuses >= 1, `${nbAccuses} accusé(s) en base`);
  const fuite = sh(`docker compose exec -T postgres pg_dump -U postgres -d laafi --data-only | grep -acF ${JSON.stringify(INSTR)} || true`);
  verifier('Le texte de l’instruction n’est pas dans la base laafi (empreinte seulement)', fuite === '0', `${fuite} occurrence(s)`);

  await pr.locator('lf-message', { hasText: INSTR }).getByRole('button', { name: 'Voir les accusés de réception' }).click();
  const ligne = pr.locator('lf-dialogue li', { hasText: 'Awa' });
  const okListe = await ligne.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
  const conforme = okListe && (await ligne.getByText('Empreinte conforme').count()) > 0;
  await capture(pr, '43-rasmata-accuses');
  verifier('Rasmata voit l’accusé d’Awa, empreinte conforme', okListe && conforme);
  await ligne.getByRole('button', { name: 'Voir la preuve' }).click();
  const signature = await pr.locator('lf-dialogue .lf-badge').first().textContent({ timeout: 15_000 }).catch(() => '');
  await capture(pr, '44-rasmata-preuve');
  verifier('Preuve signée vérifiée par le serveur', /valide/i.test(signature) && !/invalide/i.test(signature), signature.trim());
  await pr.keyboard.press('Escape');

  // Console : journal probant et vérification de la chaîne (/api/v1/journal/verification).
  const pc = rasmataConsole.page;
  await pc.goto(`${BASE}/console/journal`);
  const reponse = pc.waitForResponse((r) => r.url().includes('/journal/verification'));
  await pc.getByRole('button', { name: 'Vérifier l\'intégrité de la chaîne' }).click();
  const rep = await reponse;
  const corps = await rep.json().catch(() => ({}));
  await pc.getByText('Chaîne intègre').first().waitFor({ timeout: 15_000 }).catch(() => undefined);
  await capture(pc, '45-console-journal');
  verifier('/journal/verification : chaîne intègre', rep.status() === 200 && corps.integre === true, JSON.stringify(corps).slice(0, 160));
});

await etape('Message vocal (micro factice)', async () => {
  const pa = awa.page;
  await pa.goto(`${BASE}/salons/${encodeURIComponent(roomId)}`);
  await pa.locator('lf-composeur textarea').waitFor();
  await pa.getByRole('button', { name: 'Enregistrer un message vocal' }).click();
  await attendre(3000);
  await capture(pa, '50-awa-enregistrement');
  await pa.getByRole('button', { name: 'Envoyer le message vocal' }).click();
  const pr = rasmataClient.page;
  await pr.goto(`${BASE}/salons/${encodeURIComponent(roomId)}`);
  const vocal = pr.locator('lf-piece-jointe .audio').last();
  const recu = await vocal.waitFor({ timeout: 30_000 }).then(() => true).catch(() => false);
  let lu = false;
  if (recu) {
    await vocal.locator('button.lecture').click();
    lu = await pr.waitForFunction(() => [...document.querySelectorAll('lf-piece-jointe audio')].some((a) => a.currentTime > 0 || !a.paused), null, { timeout: 15_000 }).then(() => true).catch(() => false);
  }
  await capture(pr, '51-rasmata-vocal');
  verifier('Rasmata reçoit le message vocal et peut l’écouter (déchiffré)', recu && lu);
});

await etape('Langues mooré et dioula', async () => {
  const pa = awa.page;
  await pa.goto(`${BASE}/profil`);
  const choix = pa.locator('select', { has: pa.locator('option[value=mos]') });
  await choix.selectOption('mos');
  const mos = await pa.getByText('Goama').first().waitFor({ timeout: 5000 }).then(() => true).catch(() => false);
  await capture(pa, '60-profil-moore');
  await choix.selectOption('dyu');
  const dyu = await pa.getByText('Kan', { exact: true }).first().waitFor({ timeout: 5000 }).then(() => true).catch(() => false);
  await pa.goto(`${BASE}/salons`);
  await capture(pa, '61-salons-dioula');
  await pa.goto(`${BASE}/profil`);
  await choix.selectOption('fr');
  verifier('Bascule mooré / dioula / français', mos && dyu && (await pa.evaluate(() => localStorage.getItem('laafi.langue'))) === 'fr');
});

await etape('Enrôlement d’un nouvel agent par la console', async () => {
  const pc = rasmataConsole.page;
  const suffixe = new Date().toISOString().slice(11, 16).replace(':', '');
  const identifiant = `fatimata.ouedraogo${suffixe}`;
  await pc.goto(`${BASE}/console/agents/enroler`);
  await pc.fill('#e-prenom', 'Fatimata');
  await pc.fill('#e-nom', 'Ouédraogo');
  await pc.fill('#e-username', identifiant);
  await pc.fill('#e-email', `${identifiant}@laafi.local`);
  await pc.fill('#e-direction', 'District sanitaire de Kaya');
  await pc.fill('#e-fonction', 'Infirmière chef de poste');
  await pc.fill('#e-matricule', `E2E-${suffixe}`);
  await capture(pc, '70-console-enroler');
  await pc.getByRole('button', { name: /Enrôler l'agent/ }).click();
  await pc.locator('#resultat-titre').waitFor({ timeout: 30_000 });
  await pc.getByRole('button', { name: /Afficher/ }).click();
  const temporaire = (await pc.locator('output.secret__valeur').textContent()).trim();
  await capture(pc, '71-console-agent-enrole');
  verifier('Console : agent enrôlé, mot de passe temporaire affiché', temporaire.length >= 8, identifiant);

  // Première connexion : nouveau mot de passe puis configuration du TOTP.
  const nouveau = await profil(navig, 'fatimata');
  profilsOuverts.push(nouveau);
  const pn = nouveau.page;
  await pn.goto(`${BASE}/`);
  await pn.getByRole('button', { name: /Se connecter/i }).click();
  await pn.waitForSelector('#username');
  await pn.fill('#username', identifiant);
  await pn.fill('#password', temporaire);
  await pn.click('#kc-login');
  let secret = null;
  const etapes = [];
  for (let i = 0; i < 6 && !/\/salons/.test(pn.url()); i++) {
    await pn.waitForLoadState('domcontentloaded');
    if (await pn.locator('#password-new').isVisible().catch(() => false)) {
      etapes.push('mot de passe');
      await pn.fill('#password-new', 'Laafi2026!Nouveau');
      await pn.fill('#password-confirm', 'Laafi2026!Nouveau');
      await pn.locator('[type=submit]').first().click();
    } else if (await pn.locator('#totp').isVisible().catch(() => false)) {
      etapes.push('TOTP');
      await pn.locator('#mode-manual').click().catch(() => undefined);
      secret = (await pn.locator('#kc-totp-secret-key').textContent()).replace(/\s+/g, '');
      await capture(pn, '72-fatimata-configurer-totp');
      await pn.fill('#totp', totp(secret));
      if (await pn.locator('#userLabel').isVisible().catch(() => false)) await pn.fill('#userLabel', 'Téléphone');
      await pn.locator('[type=submit]').first().click();
    } else {
      await pn.waitForURL(/\/salons|password-new|totp/, { timeout: 15_000 }).catch(() => undefined);
    }
    await attendre(1000);
  }
  await pn.waitForURL(/\/salons/, { timeout: 60_000 });
  await capture(pn, '73-fatimata-salons');
  verifier('Première connexion : changement de mot de passe + configuration TOTP, puis accès', /\/salons/.test(pn.url()) && !!secret, etapes.join(' → '));

  const pa = awa.page;
  await pa.goto(`${BASE}/annuaire`);
  await pa.locator('input.lf-input').first().fill('Fatimata');
  const visible = await pa.locator('.lf-list__title', { hasText: 'Fatimata' }).first().waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
  await capture(pa, '74-awa-annuaire-fatimata');
  verifier('Le nouvel agent apparaît dans l’annuaire', visible);
  await nouveau.ctx.close();
  profilsOuverts.splice(profilsOuverts.indexOf(nouveau), 1);
});

async function fin() {
  await navig.close();
  const echecs = resultats.filter((r) => !r.ok);
  console.log(`\n${resultats.length - echecs.length}/${resultats.length} vérifications réussies.`);
  for (const e of echecs) console.log(`  FAIL ${e.nom} ${e.preuve}`);
  process.exit(echecs.length ? 1 : 0);
}

await fin();
