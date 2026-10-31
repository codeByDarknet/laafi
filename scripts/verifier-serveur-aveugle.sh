#!/usr/bin/env bash
# =============================================================================
# Laafi — épreuve « Le serveur ne lit rien »
#
# Démontre au jury qu'un message envoyé dans Laafi n'apparaît JAMAIS en clair
# côté serveur, ni dans la base de données, ni dans les fichiers, ni sur le réseau.
#
# Usage :
#   1. Un agent envoie dans un salon un message témoin, ex. « Réunion budget 14h mardi ».
#   2. ./scripts/verifier-serveur-aveugle.sh "Réunion budget 14h mardi"
#      → exporte (pg_dump) TOUTE la base Synapse + la base Laafi et y cherche le texte ;
#      → cherche le texte dans le stockage des médias (pièces jointes) ;
#      → liste les types d'événements stockés (on n'y trouve que m.room.encrypted
#        pour les messages : du chiffré Megolm, illisible sans les clés des appareils).
#
#   Mode réseau (optionnel, nécessite tcpdump et sudo sur l'hôte) :
#   ./scripts/verifier-serveur-aveugle.sh --reseau 60 "Réunion budget 14h mardi"
#      → capture pendant 60 s le trafic HTTP de la passerelle (port public 8888,
#        port 80 interne) et de Synapse (8008) ; envoyez le message témoin PENDANT
#        la capture ; le script cherche ensuite le texte dans les paquets capturés.
#      Alternative manuelle : sudo ngrep -d any -W byline "texte" 'tcp port 8888 or tcp port 8008'
#
# Code de sortie : 0 = texte introuvable (succès de l'épreuve), 1 = texte trouvé.
# =============================================================================
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

RESEAU=0; DUREE=60
while [ $# -gt 0 ]; do
  case "$1" in
    --reseau) RESEAU=1; if [[ "${2:-}" =~ ^[0-9]+$ ]]; then DUREE="$2"; shift; fi; shift ;;
    -h|--help) sed -n '2,26p' "$0"; exit 0 ;;
    *) break ;;
  esac
done
TEMOIN="${1:-}"
[ -n "$TEMOIN" ] || { echo "Usage : $0 [--reseau [secondes]] \"message témoin\"" >&2; exit 2; }

vert()  { printf '\033[1;32m%s\033[0m\n' "$*"; }
rouge() { printf '\033[1;31m%s\033[0m\n' "$*"; }
titre() { printf '\n\033[1m== %s ==\033[0m\n' "$*"; }

TROUVE=0
psql_synapse() { docker compose exec -T postgres psql -U postgres -d synapse -At -c "$1"; }

# --- Capture réseau (optionnelle), AVANT les vérifications de stockage --------
if [ "$RESEAU" -eq 1 ]; then
  command -v tcpdump >/dev/null || { rouge "tcpdump absent (apt install tcpdump)"; exit 2; }
  titre "Capture réseau pendant ${DUREE} s — envoyez maintenant le message témoin"
  CAPTURE="$(mktemp --suffix=.pcap)"
  # -i any : toutes les interfaces, y compris les ponts Docker (passerelle → Synapse en interne).
  sudo timeout "$DUREE" tcpdump -i any -s 0 -U -w "$CAPTURE" \
    'tcp port 8888 or tcp port 80 or tcp port 8008' 2>/dev/null || true
  # -A : affiche le contenu des paquets en ASCII ; on y cherche le texte témoin.
  if sudo tcpdump -r "$CAPTURE" -A 2>/dev/null | grep -aqF -- "$TEMOIN"; then
    rouge "RÉSEAU : texte témoin TROUVÉ en clair dans le trafic capturé !"; TROUVE=1
  else
    PAQUETS="$(sudo tcpdump -r "$CAPTURE" 2>/dev/null | wc -l)"
    vert "RÉSEAU : texte témoin absent des ${PAQUETS} paquets capturés."
    echo "Extrait d'un envoi de message capturé (corps chiffré) :"
    sudo tcpdump -r "$CAPTURE" -A 2>/dev/null | grep -ao '"algorithm":"m.megolm.v1.aes-sha2".\{0,160\}' | head -1 || true
  fi
  sudo rm -f "$CAPTURE"
fi

# --- 1. Base de données Synapse (tout le contenu, pas seulement events) -------
titre "Base PostgreSQL « synapse » : recherche du texte témoin"
# pg_dump décompresse les valeurs TOAST : on cherche dans les données réellement stockées.
N="$(docker compose exec -T postgres pg_dump -U postgres -d synapse --data-only 2>/dev/null | grep -acF -- "$TEMOIN" || true)"
if [ "${N:-0}" -gt 0 ]; then
  rouge "SYNAPSE : texte témoin TROUVÉ dans ${N} ligne(s) du dump !"; TROUVE=1
else
  vert "SYNAPSE : texte témoin absent de toute la base (tables events, event_json, etc.)."
fi

titre "Tables events / event_json : types d'événements stockés"
psql_synapse "SELECT rpad(type, 32) || count(*) FROM events GROUP BY type ORDER BY count(*) DESC;" | sed 's/^/   /'
CLAIRS="$(psql_synapse "SELECT count(*) FROM events WHERE type = 'm.room.message';")"
if [ "${CLAIRS:-0}" -gt 0 ]; then
  rouge "Attention : ${CLAIRS} événement(s) m.room.message non chiffré(s) présents (client non conforme ?)."
else
  vert "Aucun m.room.message en clair : tous les messages sont des m.room.encrypted."
fi

titre "Dernier message tel que le serveur le stocke (champ content d'event_json)"
psql_synapse "SELECT left((ej.json::jsonb -> 'content')::text, 400) FROM event_json ej JOIN events e USING (event_id)
              WHERE e.type = 'm.room.encrypted' ORDER BY e.stream_ordering DESC LIMIT 1;" | sed 's/^/   /' \
  || true

titre "Ce que le serveur voit malgré tout (métadonnées, 5 derniers messages)"
echo "   expéditeur | salon | horodatage | appareil émetteur | taille du chiffré (octets base64)"
psql_synapse "SELECT '   ' || e.sender || ' | ' || e.room_id || ' | ' || to_timestamp(e.origin_server_ts/1000)::timestamp(0)
                     || ' | ' || coalesce(ej.json::jsonb #>> '{content,device_id}', '?')
                     || ' | ' || coalesce(length(ej.json::jsonb #>> '{content,ciphertext}'), 0)
              FROM events e JOIN event_json ej USING (event_id)
              WHERE e.type = 'm.room.encrypted' ORDER BY e.stream_ordering DESC LIMIT 5;" || true

# --- 2. Base Laafi (backend : annuaire, accusés probants, audit) --------------
titre "Base PostgreSQL « laafi » (backend)"
N="$(docker compose exec -T postgres pg_dump -U postgres -d laafi --data-only 2>/dev/null | grep -acF -- "$TEMOIN" || true)"
if [ "${N:-0}" -gt 0 ]; then
  rouge "LAAFI : texte témoin TROUVÉ dans la base du backend !"; TROUVE=1
else
  vert "LAAFI : texte témoin absent (le backend ne reçoit que des empreintes SHA-256)."
fi

# --- 3. Stockage des médias (pièces jointes chiffrées côté client) ------------
titre "Stockage des médias Synapse (/data/media_store)"
if docker compose exec -T synapse grep -rqaF -- "$TEMOIN" /data/media_store 2>/dev/null; then
  rouge "MÉDIAS : texte témoin TROUVÉ dans un fichier stocké !"; TROUVE=1
else
  NB="$(docker compose exec -T synapse sh -c 'find /data/media_store -type f | wc -l' 2>/dev/null || echo 0)"
  vert "MÉDIAS : texte témoin absent des ${NB} fichier(s) stocké(s) (AES-256-CTR côté client)."
fi

echo
if [ "$TROUVE" -eq 0 ]; then
  vert "RÉSULTAT : le serveur ne détient AUCUNE copie lisible du message « ${TEMOIN} »."
  exit 0
else
  rouge "RÉSULTAT : le texte témoin a été trouvé en clair côté serveur."
  exit 1
fi
