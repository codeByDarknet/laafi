#!/usr/bin/env bash
# =============================================================================
# Laafi — remise à zéro COMPLÈTE de l'instance locale (démonstration, tests).
# Arrête la pile et SUPPRIME les volumes : bases PostgreSQL (comptes, messages
# chiffrés, journal probant), médias Synapse, clé de signature du serveur.
#
#   ./scripts/reset.sh            # demande confirmation
#   ./scripts/reset.sh --oui      # sans confirmation
#   ./scripts/reset.sh --oui --env  # supprime aussi .env (nouveaux secrets au prochain install.sh)
# =============================================================================
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

CONFIRME=0; SUPPR_ENV=0
for arg in "$@"; do
  case "$arg" in
    --oui|-y|--yes) CONFIRME=1 ;;
    --env) SUPPR_ENV=1 ;;
    *) echo "Argument inconnu : $arg" >&2; exit 2 ;;
  esac
done

if [ "$CONFIRME" -ne 1 ]; then
  read -r -p "Toutes les données Laafi de cette machine seront EFFACÉES. Continuer ? [oui/N] " rep
  [ "$rep" = "oui" ] || { echo "Annulé."; exit 0; }
fi

docker compose down --volumes --remove-orphans
if [ "$SUPPR_ENV" -eq 1 ] && [ -f .env ]; then
  rm -f .env
  echo ".env supprimé."
fi
echo "Instance Laafi remise à zéro. Relancer : ./scripts/install.sh"
