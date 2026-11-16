#!/usr/bin/env bash
# pg_dump định dạng custom vào backups/, giữ KEEP bản gần nhất.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN="${PG_BIN:-/opt/homebrew/opt/postgresql@18/bin}"
KEEP="${KEEP:-14}"
DEST="$ROOT/backups"

set -a; source "$ROOT/.env"; set +a
mkdir -p "$DEST"
chmod 700 "$DEST"

FILE="$DEST/tram_tin-$(date +%Y%m%d-%H%M%S).dump"
"$PG_BIN/pg_dump" --format=custom --no-owner --file="$FILE.part" "$DATABASE_URL"
mv "$FILE.part" "$FILE"
echo "$(date '+%F %T') backup → $FILE ($(du -h "$FILE" | cut -f1))"

# Xóa bản cũ, giữ $KEEP bản mới nhất.
ls -1t "$DEST"/tram_tin-*.dump 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r old; do
  rm -f -- "$old"
done
