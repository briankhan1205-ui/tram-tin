#!/usr/bin/env bash
# Tạo role + database cho Trạm Tin (idempotent) và sinh .env nếu chưa có.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN="${PG_BIN:-/opt/homebrew/opt/postgresql@18/bin}"
PSQL="$PG_BIN/psql -h localhost -d postgres -v ON_ERROR_STOP=1 -Atq"
DB_NAME="${DB_NAME:-tram_tin}"
DB_USER="${DB_USER:-tram_tin}"

"$PG_BIN/pg_isready" -h localhost -q || {
  echo "Postgres chưa chạy. Chạy: brew services start postgresql@18" >&2
  exit 1
}

if [[ -f "$ROOT/.env" ]] && grep -q '^DATABASE_URL=' "$ROOT/.env"; then
  echo ".env đã có DATABASE_URL → giữ nguyên mật khẩu hiện tại."
  DB_PASS="$(grep '^DATABASE_URL=' "$ROOT/.env" | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')"
else
  DB_PASS="$(openssl rand -hex 16)"
  sed "s#^DATABASE_URL=.*#DATABASE_URL=postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME#" \
    "$ROOT/.env.example" > "$ROOT/.env"
  chmod 600 "$ROOT/.env"
  echo "Đã tạo .env (chmod 600)."
fi

if [[ "$($PSQL -c "select 1 from pg_roles where rolname = '$DB_USER'")" != "1" ]]; then
  $PSQL -c "create role $DB_USER login password '$DB_PASS'"
  echo "Đã tạo role $DB_USER."
else
  $PSQL -c "alter role $DB_USER login password '$DB_PASS'"
fi

if [[ "$($PSQL -c "select 1 from pg_database where datname = '$DB_NAME'")" != "1" ]]; then
  $PSQL -c "create database $DB_NAME owner $DB_USER encoding 'UTF8' template template0"
  echo "Đã tạo database $DB_NAME."
fi

# Extension cần superuser lần đầu; migration chỉ CREATE ... IF NOT EXISTS.
"$PG_BIN/psql" -h localhost -d "$DB_NAME" -v ON_ERROR_STOP=1 -q \
  -c "create extension if not exists unaccent" \
  -c "create extension if not exists pg_trgm"

echo "DB sẵn sàng: $DB_NAME (user $DB_USER)."
