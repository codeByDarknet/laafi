#!/usr/bin/env bash
# =============================================================================
# Laafi — installation en une commande sur un serveur maîtrisé.
#
#   ./scripts/install.sh                       # http://localhost:8888
#   ./scripts/install.sh https://laafi.exemple.bf
#   ./scripts/install.sh --sans-demarrage      # génère seulement .env
#
# 1. génère .env avec des secrets aléatoires (openssl) s'il n'existe pas ;
# 2. construit et lance toute la pile : docker compose up -d --build ;
# 3. attend que les services soient sains, puis affiche l'URL et les comptes de démo.
# =============================================================================
set -euo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RACINE"

DEMARRER=1
URL_PUBLIQUE=""
for arg in "$@"; do
  case "$arg" in
    --sans-demarrage) DEMARRER=0 ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    http://*|https://*) URL_PUBLIQUE="${arg%/}" ;;
    *) echo "Argument inconnu : $arg" >&2; exit 2 ;;
  esac
done

info()  { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
alerte(){ printf '\033[1;33m[!]\033[0m %s\n' "$*" >&2; }
echec() { printf '\033[1;31m[x]\033[0m %s\n' "$*" >&2; exit 1; }

command -v docker  >/dev/null || echec "Docker est requis (https://docs.docker.com/engine/install/)."
docker compose version >/dev/null 2>&1 || echec "Le plugin « docker compose » (v2) est requis."
command -v openssl >/dev/null || echec "openssl est requis pour générer les secrets."

# --- 1. Fichier .env -----------------------------------------------------------
if [ -f .env ]; then
  info ".env existant conservé (supprimez-le ou lancez scripts/reset.sh pour en générer un nouveau)."
else
  MODELE=.env.example
  [ -f "$MODELE" ] || MODELE=infra/env.example
  [ -f "$MODELE" ] || echec "Modèle .env.example introuvable."

  # Des volumes existants ont été initialisés avec d'autres secrets : les mots de passe
  # PostgreSQL ne correspondraient plus. On refuse plutôt que de casser l'installation.
  if docker volume inspect laafi_pg-data >/dev/null 2>&1; then
    echec "Des données Laafi existent déjà (volume laafi_pg-data) sans .env correspondant. Lancez d'abord ./scripts/reset.sh."
  fi

  info "Génération de .env avec des secrets aléatoires (à partir de $MODELE)…"
  umask 077                                   # .env lisible par le seul propriétaire
  : > .env
  while IFS= read -r ligne || [ -n "$ligne" ]; do
    if [[ "$ligne" =~ ^([A-Z0-9_]+)=A_GENERER$ ]]; then
      # 32 octets aléatoires du générateur cryptographique d'OpenSSL, en hexadécimal.
      printf '%s=%s\n' "${BASH_REMATCH[1]}" "$(openssl rand -hex 32)" >> .env
    elif [[ -n "$URL_PUBLIQUE" && "$ligne" =~ ^PUBLIC_URL= ]]; then
      printf 'PUBLIC_URL=%s\n' "$URL_PUBLIQUE" >> .env
    else
      printf '%s\n' "$ligne" >> .env
    fi
  done < "$MODELE"
  umask 022
fi

# Lecture des quelques valeurs utiles à l'affichage final.
valeur() { grep -E "^$1=" .env | tail -1 | cut -d= -f2-; }
PUBLIC_URL="$(valeur PUBLIC_URL)"; PUBLIC_URL="${PUBLIC_URL:-http://localhost:8888}"
LAAFI_PORT="$(valeur LAAFI_PORT)"; LAAFI_PORT="${LAAFI_PORT:-8888}"

if [ "$DEMARRER" -eq 0 ]; then
  info ".env prêt. Démarrage manuel : docker compose up -d --build"
  exit 0
fi

# --- 2. Construction et démarrage --------------------------------------------
info "Construction des images et démarrage de la pile (plusieurs minutes la première fois)…"
docker compose up -d --build

# --- 3. Attente de la santé des services -------------------------------------
attendre_sante() {
  local service="$1" max="${2:-120}" etat=""
  for _ in $(seq 1 "$max"); do
    etat="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
             "$(docker compose ps -q "$service" 2>/dev/null | head -1)" 2>/dev/null || true)"
    case "$etat" in healthy|running) return 0 ;; esac
    sleep 5
  done
  alerte "Service $service non sain (état : ${etat:-absent}). Voir : docker compose logs $service"
  return 1
}
OK=1
for s in postgres keycloak synapse gateway backend client console; do
  printf '   - %-10s ' "$s"
  if attendre_sante "$s"; then echo "ok"; else OK=0; fi
done
code_bootstrap="$(docker inspect -f '{{.State.ExitCode}}' "$(docker compose ps -aq synapse-bootstrap | head -1)" 2>/dev/null || echo '?')"
[ "$code_bootstrap" = "0" ] || { alerte "synapse-bootstrap a échoué (code $code_bootstrap) : docker compose logs synapse-bootstrap"; OK=0; }

BASE="http://localhost:${LAAFI_PORT}"
curl -fsS "$BASE/_matrix/client/versions" >/dev/null 2>&1 || { alerte "Synapse injoignable via la passerelle."; OK=0; }
curl -fsS "$BASE/auth/realms/laafi/.well-known/openid-configuration" >/dev/null 2>&1 || { alerte "Keycloak injoignable via la passerelle."; OK=0; }

# --- 4. Récapitulatif --------------------------------------------------------
cat <<TXT

  =====================================================================
  Laafi : $( [ $OK -eq 1 ] && echo "installation terminée, services sains." || echo "démarré AVEC ALERTES (voir ci-dessus).")
  =====================================================================
  Messagerie des agents : ${PUBLIC_URL}/
  Console d'admin       : ${PUBLIC_URL}/console/

  Comptes de démonstration (FICTIFS) — mot de passe : Laafi2026!
    super.admin    super_admin            (MTDPCE)
    admin.sante    admin_ministere        (MSHP)
    awa.sawadogo   chef_service           (MSHP)
    issa.kabore    agent                  (MSHP)
    mariam.traore  agent                  (MTDPCE)
    paul.zongo     agent                  (MEF)

  Second facteur (TOTP) : ajoutez dans FreeOTP/Aegis/Google Authenticator
  la clé de DÉMO  JBSWY3DPEHPK3PXP  (SHA1, 6 chiffres, 30 s)
  ou :  oathtool --totp -b JBSWY3DPEHPK3PXP

  Épreuve « Le serveur ne lit rien » :
    ./scripts/verifier-serveur-aveugle.sh "texte du message témoin"
TXT
[ $OK -eq 1 ] || exit 1
