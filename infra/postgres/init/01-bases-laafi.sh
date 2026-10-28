#!/bin/bash
# Initialisation PostgreSQL (exécuté UNE seule fois, au premier démarrage, volume vide).
# Une base et un rôle dédiés par service : un service compromis n'accède pas aux données des autres.
set -euo pipefail

: "${SYNAPSE_DB_PASSWORD:?SYNAPSE_DB_PASSWORD manquant}"
: "${KEYCLOAK_DB_PASSWORD:?KEYCLOAK_DB_PASSWORD manquant}"
: "${LAAFI_DB_PASSWORD:?LAAFI_DB_PASSWORD manquant}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  -v synapse_pw="$SYNAPSE_DB_PASSWORD" \
  -v keycloak_pw="$KEYCLOAK_DB_PASSWORD" \
  -v laafi_pw="$LAAFI_DB_PASSWORD" <<'SQL'
CREATE ROLE synapse  LOGIN PASSWORD :'synapse_pw';
CREATE ROLE keycloak LOGIN PASSWORD :'keycloak_pw';
CREATE ROLE laafi    LOGIN PASSWORD :'laafi_pw';

-- Synapse exige UTF8 et un tri « C » (sinon il refuse de démarrer).
CREATE DATABASE synapse OWNER synapse
  ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0;
CREATE DATABASE keycloak OWNER keycloak ENCODING 'UTF8';
CREATE DATABASE laafi    OWNER laafi    ENCODING 'UTF8';

-- Personne d'autre que le propriétaire ne se connecte à chaque base.
REVOKE ALL ON DATABASE synapse  FROM PUBLIC;
REVOKE ALL ON DATABASE keycloak FROM PUBLIC;
REVOKE ALL ON DATABASE laafi    FROM PUBLIC;
SQL
echo "Bases synapse, keycloak et laafi créées."
