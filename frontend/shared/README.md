# Laafi — design system partagé

Styles, polices et marque communs au **client de messagerie** (`frontend/client`, base href `/`)
et à la **console d'administration** (`frontend/console`, base href `/console/`).
Aucune dépendance externe : pas de CDN, pas de police en ligne, pas de bibliothèque d'icônes.

```
shared/
├── styles/
│   ├── laafi.scss        point d'entrée (à importer une seule fois par application)
│   ├── _tokens.scss      jetons (maps Sass) + mixins — n'émet AUCUN CSS à l'import
│   ├── _fonts.scss       @font-face Noto Sans (URL relatives vers ../fonts)
│   ├── _base.scss        reset, typographie, liens, focus, défilement, mouvement réduit
│   └── _components.scss  composants .lf-*
├── fonts/                Noto Sans variable woff2 + licence OFL (OFL-NotoSans.txt)
├── brand/                logo, symbole, favicon, motif Faso Dan Fani (SVG)
├── preview.html          page de référence de tous les composants
└── preview/laafi.css     CSS compilé pour preview.html (généré)
```

## Intégration dans une application Angular

### 1. `angular.json`

Dans `projects.<app>.architect.build.options` :

```jsonc
"styles": ["src/styles.scss"],
"stylePreprocessorOptions": {
  "includePaths": ["../shared/styles"]
},
"assets": [
  { "glob": "**/*", "input": "public" },
  { "glob": "**/*.svg", "input": "../shared/brand", "output": "assets/brand" }
]
```

Les **polices n'ont pas besoin d'être déclarées dans `assets`** : `_fonts.scss` les référence en URL
relatives (`url('../fonts/…woff2')`) ; le builder Angular (`@angular/build:application`) réécrit
ces URL, copie les fichiers dans `media/` et les sert relativement à la feuille de style. Cela
fonctionne donc tel quel pour le client (`/`) comme pour la console (`/console/`).

> Repli si votre configuration ne réécrit pas les URL (ancien builder, `"externalDependencies"`…) :
> ajoutez `{ "glob": "*.woff2", "input": "../shared/fonts", "output": "assets/fonts" }` dans
> `assets` et remplacez `../fonts/` par `assets/fonts/` (chemin relatif, compatible base href) dans
> une copie locale de `_fonts.scss`.

### 2. `src/styles.scss`

```scss
@use 'laafi';

// Styles globaux propres à l'application ensuite.
```

### 3. Styles de composants

N'importez que les jetons, qui n'émettent aucun CSS (pas de duplication dans chaque composant) :

```scss
@use 'tokens' as lf;

.room-header {
  padding: var(--lf-space-3) var(--lf-gutter);
  border-bottom: 1px solid var(--lf-border);

  @include lf.bp(md) { padding-inline: var(--lf-space-6); }
}

.icon-action { @include lf.focus-ring; }
.label-hidden { @include lf.visually-hidden; }
```

Mixins disponibles : `bp($nom)` (alias `breakpoint`), `focus-ring($offset)`, `visually-hidden`,
`truncate`, `motion-safe`. Points de rupture (mobile d'abord) : `sm` 480, `md` 768, `lg` 1024,
`xl` 1280 px.

### 4. `index.html`

```html
<link rel="icon" href="assets/brand/favicon.svg" type="image/svg+xml">
<meta name="theme-color" content="#f8f3ed" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#12181c" media="(prefers-color-scheme: dark)">
```

Chemin **relatif** (`assets/…`, sans `/` initial) pour respecter le base href `/console/`.

## Thème clair / sombre

- Par défaut, le thème suit le système (`prefers-color-scheme`).
- Pour forcer : `document.documentElement.dataset.theme = 'dark' | 'light'`.
  Supprimer l'attribut rend la main au système.
- Tous les composants lisent des propriétés `--lf-*` : aucune recompilation, aucune classe à changer.

## Conventions

- Préfixe `lf-` partout, BEM léger : `.lf-card`, `.lf-card__title`, `.lf-btn--primary`.
- **Les états passent par ARIA** quand c'est possible : `aria-selected`, `aria-pressed`,
  `aria-current`, `aria-invalid`, `aria-busy`. Le style suit l'accessibilité au lieu de la dupliquer.
- Jamais de couleur « en dur » dans les apps : utiliser `var(--lf-…)`.
- Cibles tactiles : `--lf-control-md` = 44 px.
- Animations : uniquement en réponse à une action (ouverture de modale, toast) ; toutes
  désactivées par `prefers-reduced-motion`.

## Catalogue des composants

| Classe | Usage |
| --- | --- |
| `.lf-appbar` (+ `__inner`, `__brand`, `__context`, `__spacer`) | barre d'application, avec `.lf-fani` en liseré |
| `.lf-fani` | bande tissée Faso Dan Fani (élément de marque, 4–6 px, `aria-hidden`) |
| `.lf-btn` `--primary` `--secondary` `--danger` `--danger-outline` `--ghost` `--sm` `--lg` `--icon` `--block` | boutons ; chargement via `aria-busy="true"` |
| `.lf-field` `.lf-label(--required)` `.lf-input` `.lf-input--code` `.lf-hint` `.lf-error` `.lf-search` `.lf-check` `.lf-switch` | formulaires (input, select, textarea, OTP, recherche, case, radio, interrupteur) |
| `.lf-card` (+ `__header`, `__title`, `__body`, `__footer`, `--interactive`, `--stat`) | cartes et indicateurs du tableau de bord |
| `.lf-badge` `--success` `--warning` `--danger` `--dot` `--count` | statuts (`ACTIF`, `APPAREILS_REVOQUES`, `REVOQUE`) et compteurs |
| `.lf-cls` `--dr` `--conf` `--lg` ou `[data-cls="…"]` | **classification** des messages |
| `.lf-avatar` `[data-tint="0–5"]` `--xs/sm/lg/xl` `--group` `--revoked` `__verified` | avatars à initiales |
| `.lf-list` `--divided`, `__item(--unread)`, `__body`, `__title`, `__meta`, `__trailing` | conversations, annuaire, appareils |
| `.lf-table-wrap` `.lf-table` `--stack` `__num` `__actions` | tableaux d'administration ; `--stack` + `data-label` = fiches sur mobile |
| `.lf-alert` `--success` `--warning` `--danger` | bandeaux (ex. « Accès révoqué ») |
| `.lf-toast-region` `.lf-toast` `--warning` `--danger` `--neutral` | notifications éphémères (`aria-live`) |
| `.lf-modal` (+ `__header`, `__title`, `__body`, `__footer`, `--wide`, `--danger`), `.lf-modal-backdrop` | pour `<dialog>` natif ; feuille basse sur mobile |
| `.lf-close` | bouton « × » commun |
| `.lf-tabs` `.lf-tab` `.lf-tabpanel` | onglets (`role="tablist"`) |
| `.lf-chip` `__remove` | filtres (`aria-pressed`) |
| `.lf-skeleton` `--text` `--title` `--circle` `--block` | chargement |
| `.lf-empty` (+ `__art`, `__title`, `__text`) | état vide : une phrase d'orientation + une action |
| `.lf-thread` `.lf-day` `.lf-bubble` `--out` `--instruction` `[data-cls]` | fil de messagerie |
| `.lf-watermark[data-watermark]` | filigrane nominatif (politique CONFIDENTIEL) |
| `.lf-blur-guard` + `.is-blurred` | flou hors focus (CONFIDENTIEL) |
| `.lf-no-copy` | désactive la sélection (copie interdite) |
| `.lf-stack` `.lf-cluster` `.lf-container` `.lf-sr-only` `.lf-skip-link` `.lf-truncate` `.lf-muted` `.lf-mono` | utilitaires |

### Classification : choix d'accessibilité

Le sens n'est jamais porté par la seule couleur : le libellé est toujours écrit, et le marqueur se
remplit avec le niveau (anneau vide → moitié → plein). Lisible par un daltonien et en impression
noir et blanc.

```html
<span class="lf-cls" [attr.data-cls]="message.classification">{{ libelle(message.classification) }}</span>
<div class="lf-bubble" [attr.data-cls]="message.classification">…</div>
```

Les filigranes, le flou hors focus et l'interdiction de copie sont **dissuasifs** : le web ne permet
pas de bloquer une capture d'écran (cf. contrat §6).

## Palette

Les couleurs du drapeau (`--lf-flag-red` #EF2B2D, `--lf-flag-green` #009E49, `--lf-flag-gold`
#FCD116) sont réservées aux accents de marque : elles ne portent jamais de texte blanc (contraste
insuffisant : 3,5:1 et 4,2:1). Les actions utilisent des variantes approfondies.

| Rôle | Clair | Sombre |
| --- | --- | --- |
| Fond (`--lf-bg`) | #F8F3ED sable | #12181C ardoise |
| Surface | #FFFFFF | #1A2227 |
| Encre (`--lf-ink`) | #1E2622 | #ECE7E0 |
| Encre secondaire | #545E58 | #A9B2AD |
| Action (`--lf-accent`) | #007A3D (texte blanc) | #34C27A (texte #08200F) |
| Danger | #C21E25 (texte blanc) | #D93036 (texte blanc) |
| Normal | #3F4843 sur #ECE5DB | #C9D0CB sur #262F35 |
| Diffusion restreinte | #6B4500 sur #FFF0C2 | #FFD66B sur #33280C |
| Confidentiel | #8F161B sur #FCE6E5 | #FFB4AE sur #3D1517 |

Contrastes mesurés (formule WCAG 2.x) : encre/fond 14,0:1 (clair) et 14,6:1 (sombre) ; encre
secondaire ≥ 5,6:1 sur toutes les surfaces ; encre tertiaire (placeholders) ≥ 4,6:1 sur surface ;
bouton primaire 5,45:1 / 7,47:1 ; bouton danger 5,99:1 / 4,74:1 (survol 6,1:1) ; badges de
classification ≥ 7,4:1 ; six teintes d'avatar ≥ 7,2:1 dans les deux thèmes ; bordure des champs
≥ 3:1 (exigence des composants d'interface, WCAG 1.4.11). Focus : anneau 2 px vert foncé (clair)
ou or (sombre) + halo.

## Typographie

**Noto Sans** variable (axes graisse 100–900 et largeur 62,5–100 %), licence SIL OFL 1.1, issue de
`@fontsource-variable/noto-sans@5.3.0`. Choisie parce qu'elle couvre **tout l'alphabet du mooré et
du dioula** (ɛ ɔ ɩ ʋ ŋ, majuscules Ɛ Ɔ Ʋ Ɩ, voyelles nasales ã ẽ ĩ õ ũ) — vérifié glyphe par glyphe ;
Public Sans, Atkinson Hyperlegible Next et Bricolage Grotesque, testées, n'ont pas ɩ / ʋ / ɛ / ɔ.

Une seule famille : les titres sont resserrés par l'axe de largeur (`font-stretch: 87.5%`) et plus
gras, ce qui donne un ton officiel sans seconde police à charger. Découpage `unicode-range` : seul
le sous-ensemble latin (60 Ko) est chargé pour un texte en français ; latin étendu (290 Ko) et le
sous-ensemble des diacritiques combinants (24 Ko) ne se chargent que si un texte en langue nationale
s'affiche. Échelle 1,2 sur 16 px : `--lf-text-2xs` … `--lf-text-4xl`. Chiffres tabulaires dans les
tableaux et les heures. Police à chasse fixe = police système (identifiants Matrix, empreintes).

## Marque

| Fichier | Usage |
| --- | --- |
| `brand/laafi-mark.svg` / `laafi-mark-dark.svg` | symbole seul (bulle verte, « L », étoile d'or), net dès 16 px |
| `brand/laafi-logo.svg` / `laafi-logo-dark.svg` | symbole + logotype (texte vectorisé depuis Noto Sans 800 / 87,5 %) |
| `brand/favicon.svg` | favicon qui suit le thème du navigateur |
| `brand/motif-fani.svg` | tuile 48×48 du motif tissé (fonds de marque, supports de présentation) |

Dans l'interface, le motif s'utilise en **liseré** (`.lf-fani`, 4–6 px) : en-tête, écran de
connexion. Jamais en aplat derrière du texte.

## Régénérer l'aperçu

```bash
cd frontend/shared
npx sass@1.107.1 --no-source-map styles/laafi.scss preview/laafi.css
# puis ouvrir preview.html dans un navigateur
```

## Licences

- Code (SCSS, SVG, HTML) : EUPL-1.2, comme le reste du dépôt.
- Noto Sans : SIL Open Font License 1.1 — `fonts/OFL-NotoSans.txt`.

## Docker

Le dossier `shared/` est **hors** des projets Angular : le contexte de build Docker du client et de la
console doit être `frontend/` (ou la racine), pas `frontend/client`, sinon `../shared` est introuvable.
