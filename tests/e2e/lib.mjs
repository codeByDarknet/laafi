// =============================================================================
// Laafi — outils communs des tests de bout en bout (navigateur réel, Playwright).
//
// - totp()      : calcule le code TOTP de démonstration (RFC 6238, comme oathtool) ;
// - navigateur(): lance Chromium (sans interface) ;
// - connecter() : connexion d'un agent au client par SSO (mot de passe + TOTP via Keycloak).
//
// Comptes et secret TOTP : docs/COMPTES-DEMO.md (valeurs de démonstration publiques).
// =============================================================================
import { createHmac } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

export const BASE = process.env.LAAFI_URL ?? 'http://localhost:8888';
export const MOT_DE_PASSE = 'Laafi2026!';
export const SECRET_TOTP = 'JBSWY3DPEHPK3PXP';
export const CAPTURES = process.env.LAAFI_CAPTURES ?? join(process.cwd(), 'captures');
mkdirSync(CAPTURES, { recursive: true });

/** Décodage base32 (RFC 4648) du secret TOTP. */
function base32(texte) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of texte.replace(/=+$/, '')) bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const octets = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) octets.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(octets);
}

/** Code TOTP à 6 chiffres (HMAC-SHA1, période 30 s), décalé de `decalage` périodes. */
export function totp(secret = SECRET_TOTP, decalage = 0) {
  const compteur = Math.floor(Date.now() / 1000 / 30) + decalage;
  const tampon = Buffer.alloc(8);
  tampon.writeBigUInt64BE(BigInt(compteur));
  const h = createHmac('sha1', base32(secret)).update(tampon).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

/**
 * Keycloak refuse de réutiliser un même code TOTP pour un même compte (anti-rejeu).
 * Quand on connecte plusieurs fois le même agent dans la même fenêtre de 30 s,
 * on attend donc la période suivante.
 */
const derniersCodes = new Map();
export async function codeFrais(utilisateur, secret = SECRET_TOTP) {
  for (;;) {
    const code = totp(secret);
    const resteSecondes = 30 - (Math.floor(Date.now() / 1000) % 30);
    if (derniersCodes.get(utilisateur) !== code && resteSecondes > 3) {
      derniersCodes.set(utilisateur, code);
      return code;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

/** Chromium de Playwright déjà présent dans ~/.cache/ms-playwright (ou CHROMIUM_PATH). */
function cheminChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const cache = join(homedir(), '.cache', 'ms-playwright');
  const dossiers = existsSync(cache) ? readdirSync(cache).filter((d) => d.startsWith('chromium-')) : [];
  for (const d of dossiers.sort().reverse()) {
    const exe = join(cache, d, 'chrome-linux64', 'chrome');
    if (existsSync(exe)) return exe;
  }
  return undefined; // laisse Playwright chercher lui-même
}

export async function navigateur() {
  return chromium.launch({
    executablePath: cheminChromium(),
    headless: process.env.HEADED !== '1',
    // Micro factice (bip) pour tester le message vocal sans matériel.
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  });
}

/** Un « profil de navigateur » isolé (cookies, localStorage, IndexedDB propres). */
export async function profil(browser, nom) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: 'fr-FR',
    acceptDownloads: true,
    permissions: ['microphone'],
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[${nom}] erreur JS :`, e.message));
  page.on('response', async (r) => {
    // room_keys/version : 404 normal tant qu'aucune sauvegarde de clés n'est configurée.
    if (r.status() >= 400 && !r.url().includes('/room_keys/version')) {
      // Pour l'API métier, on affiche aussi le corps de l'erreur (code et message).
      const corps = r.url().includes('/api/v1/') ? ` ${(await r.text().catch(() => '')).slice(0, 200)}` : '';
      console.log(`[${nom}] HTTP ${r.status()} ${r.request().method()} ${r.url().slice(0, 160)}${corps}`);
    }
  });
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) console.log(`[${nom}] console :`, m.text().slice(0, 300));
  });
  if ((process.env.DEBUG_SYNC ?? '').split(',').includes(nom)) {
    page.on('request', (r) => {
      if (/\/(sync|join)/.test(r.url())) console.log(`[${nom}] -> ${r.method()} ${r.url().slice(40, 80)} ${r.url().match(/since=[^&]*/)?.[0] ?? ''}`);
    });
    page.on('response', async (r) => {
      if (r.url().includes('/sync')) {
        const j = await r.json().catch(() => ({}));
        const rooms = Object.entries(j.rooms ?? {}).map(([k, v]) => `${k}:${Object.keys(v).map((id) => id.slice(0, 6)).join(',')}`).join(' ');
        console.log(`[${nom}] <- sync ${r.status()} ${j.next_batch} ${rooms}`);
        for (const [id, v] of Object.entries(j.rooms?.join ?? {})) {
          const moi = (l) => (l ?? []).filter((e) => e.type === 'm.room.member' && e.state_key?.startsWith('@issa')).map((e) => e.content.membership).join('/');
          console.log(`[${nom}]    join ${id.slice(0, 8)} limited=${v.timeline?.limited} tl=${v.timeline?.events?.length} tlMoi=${moi(v.timeline?.events)} state=${moi(v.state?.events)} after=${'org.matrix.msc4222.state_after' in v ? moi(v['org.matrix.msc4222.state_after']?.events) + '(' + v['org.matrix.msc4222.state_after']?.events?.length + ')' : 'absent'}`);
        }
      }
    });
    page.on('console', (m) => { if (['warning', 'error', 'info', 'log'].includes(m.type())) console.log(`[${nom}] ${m.type()} ${m.text().slice(0, 300)}`); });
  }
  return { ctx, page, nom };
}

export async function capture(page, nom) {
  const chemin = join(CAPTURES, `${nom}.png`);
  await page.screenshot({ path: chemin, fullPage: false });
  return chemin;
}

/** Remplit le formulaire Keycloak : identifiant + mot de passe, puis code TOTP. */
export async function saisirKeycloak(page, utilisateur, motDePasse = MOT_DE_PASSE, code = null) {
  await page.waitForSelector('#username', { timeout: 30_000 });
  await page.fill('#username', utilisateur);
  await page.fill('#password', motDePasse);
  await page.click('#kc-login');
  await page.waitForLoadState('domcontentloaded');
  const otp = page.locator('#otp');
  if (await otp.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await otp.fill(code ?? (await codeFrais(utilisateur)));
    await page.click('#kc-login');
  }
}

/** Connexion complète d'un agent au client de messagerie, jusqu'à la liste des salons. */
export async function connecter(p, utilisateur) {
  const { page } = p;
  await page.goto(`${BASE}/`);
  await page.getByRole('button', { name: /Se connecter/i }).click();
  await saisirKeycloak(page, utilisateur);
  await page.waitForURL(/\/salons/, { timeout: 60_000 });
  return page;
}

/** Connexion d'un administrateur à la console (/console/), jusqu'au tableau de bord. */
export async function connecterConsole(p, utilisateur) {
  const { page } = p;
  await page.goto(`${BASE}/console/`);
  await saisirKeycloak(page, utilisateur);
  await page.waitForURL(/\/console\/(tableau-de-bord|agents)/, { timeout: 60_000 });
  return page;
}

export function attendre(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
