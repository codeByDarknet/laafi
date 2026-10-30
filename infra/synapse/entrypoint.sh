#!/bin/bash
# Démarrage de Synapse pour Laafi :
#  1. génère /data/homeserver.yaml à partir du modèle et des variables d'environnement ;
#  2. génère la clé de signature du serveur au premier démarrage (/data/signing.key) ;
#  3. lance Synapse via le script officiel de l'image (/start.py).
set -euo pipefail

TEMPLATE=/laafi-config/homeserver.yaml.tmpl
CONFIG=/data/homeserver.yaml

# Substitution stricte des ${VAR} : une variable absente fait échouer le démarrage
# (on préfère une erreur claire à un serveur mal configuré).
python3 - "$TEMPLATE" "$CONFIG" <<'PY'
import os, re, sys
src, dst = sys.argv[1], sys.argv[2]
text = open(src, encoding="utf-8").read()
missing = []
def remplacer(m):
    nom = m.group(1)
    if nom not in os.environ:
        missing.append(nom)
        return m.group(0)
    return os.environ[nom]
# Les lignes de commentaire sont recopiées telles quelles.
out = "".join(l if l.lstrip().startswith("#") else re.sub(r"\$\{([A-Z0-9_]+)\}", remplacer, l)
              for l in text.splitlines(keepends=True))
if missing:
    sys.exit("Variables manquantes pour homeserver.yaml : " + ", ".join(sorted(set(missing))))
with open(dst, "w", encoding="utf-8") as f:
    f.write(out)
PY

cp /laafi-config/log.config /data/log.config
mkdir -p /data/media_store

# Clé de signature Ed25519 du serveur (générée par Synapse lui-même, jamais par nous).
if [ ! -s /data/signing.key ]; then
  echo "Première exécution : génération de la clé de signature Synapse."
  python3 -m synapse.app.homeserver --config-path "$CONFIG" --generate-keys
fi

# Synapse tourne sous l'utilisateur non privilégié 991 (UID/GID de l'image).
# Attention : en bash, $UID est une variable interne (0 pour root) ; on ne peut donc pas
# écrire "${UID:-991}" : /data resterait à root et Synapse ne pourrait pas écrire les médias.
chown -R 991:991 /data

export SYNAPSE_CONFIG_PATH="$CONFIG"
exec /start.py
