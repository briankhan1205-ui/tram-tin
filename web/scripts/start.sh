#!/bin/sh
# Chạy bản production; đọc WEB_HOST/WEB_PORT từ .env ở gốc dự án.
set -eu
cd "$(dirname "$0")/.."
if [ -f ../.env ]; then
  set -a
  # shellcheck disable=SC1091
  . ../.env
  set +a
fi
[ -d .next ] || { echo "Chưa build: chạy 'pnpm build' trước" >&2; exit 1; }
exec ./node_modules/.bin/next start -H "${WEB_HOST:-127.0.0.1}" -p "${WEB_PORT:-3100}"
