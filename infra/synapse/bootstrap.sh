#!/bin/bash
# Conteneur « one-shot » synapse-bootstrap : crée (une seule fois) le compte de service
# administrateur @laafi-service, utilisé par le backend pour l'Admin API Synapse.
# Idempotent : si le compte existe déjà et que le mot de passe est bon, on ne fait rien.
set -euo pipefail

SYNAPSE_URL="${SYNAPSE_URL:-http://synapse:8008}"
USER_LOCALPART="${SYNAPSE_SERVICE_USER:-laafi-service}"
: "${SYNAPSE_SERVICE_PASSWORD:?SYNAPSE_SERVICE_PASSWORD manquant}"
: "${SYNAPSE_REGISTRATION_SHARED_SECRET:?SYNAPSE_REGISTRATION_SHARED_SECRET manquant}"

echo "Attente de Synapse ($SYNAPSE_URL)…"
for _ in $(seq 1 60); do
  curl -fsS "$SYNAPSE_URL/health" >/dev/null 2>&1 && break
  sleep 2
done

connexion() {
  python3 - "$SYNAPSE_URL" "$USER_LOCALPART" "$SYNAPSE_SERVICE_PASSWORD" <<'PY'
import json, sys, urllib.request
url, user, pw = sys.argv[1:4]
body = json.dumps({"type": "m.login.password",
                   "identifier": {"type": "m.id.user", "user": user},
                   "password": pw,
                   "initial_device_display_name": "synapse-bootstrap"}).encode()
req = urllib.request.Request(url + "/_matrix/client/v3/login", body, {"Content-Type": "application/json"})
try:
    print(json.load(urllib.request.urlopen(req, timeout=10))["access_token"])
except Exception:
    sys.exit(1)
PY
}

if TOKEN=$(connexion); then
  echo "Compte de service @$USER_LOCALPART déjà présent."
else
  echo "Création du compte de service administrateur @$USER_LOCALPART…"
  # register_new_matrix_user utilise le secret partagé (HMAC) : seule méthode d'inscription
  # possible, puisque enable_registration est à false.
  register_new_matrix_user --admin \
    -u "$USER_LOCALPART" -p "$SYNAPSE_SERVICE_PASSWORD" \
    -k "$SYNAPSE_REGISTRATION_SHARED_SECRET" "$SYNAPSE_URL"
  TOKEN=$(connexion) || { echo "ERREUR : connexion du compte de service impossible (mot de passe modifié ?)." >&2; exit 1; }
fi

# Le compte de service n'est pas soumis à la limitation de débit (enrôlements/révocations en série).
curl -fsS -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"messages_per_second":0,"burst_count":0}' \
  "$SYNAPSE_URL/_synapse/admin/v1/users/@$USER_LOCALPART:${SYNAPSE_SERVER_NAME:-laafi.local}/override_ratelimit" >/dev/null

# On ferme la session ouverte pour ce test : le backend ouvrira la sienne.
curl -fsS -X POST -H "Authorization: Bearer $TOKEN" "$SYNAPSE_URL/_matrix/client/v3/logout" >/dev/null || true
echo "synapse-bootstrap terminé."
