#!/usr/bin/env bash
# Cài / gỡ / xem trạng thái các LaunchAgent của Trạm Tin.
#   ops/launchd.sh install|uninstall|status
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AGENTS="$HOME/Library/LaunchAgents"
LOGS="$HOME/Library/Logs/tram-tin"
DOMAIN="gui/$(id -u)"
LABELS=(com.tramtin.crawler com.tramtin.web com.tramtin.backup)

UV="$(command -v uv || true)"
NODE_DIR="$(dirname "$(command -v node || echo /usr/local/bin/node)")"
PATH_VAL="$NODE_DIR:$(dirname "${UV:-/opt/homebrew/bin/uv}"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

render() {
  sed -e "s#__ROOT__#$ROOT#g" -e "s#__UV__#$UV#g" -e "s#__PATH__#$PATH_VAL#g" -e "s#__LOGS__#$LOGS#g" "$1"
}

case "${1:-}" in
  install)
    [[ -n "$UV" ]] || { echo "Không thấy uv trong PATH" >&2; exit 1; }
    [[ -d "$ROOT/web/.next" ]] || { echo "Web chưa build: make web-build" >&2; exit 1; }
    mkdir -p "$AGENTS" "$LOGS"
    for label in "${LABELS[@]}"; do
      dst="$AGENTS/$label.plist"
      render "$ROOT/ops/launchd/$label.plist.tmpl" > "$dst.tmp"
      plutil -lint -s "$dst.tmp"
      mv "$dst.tmp" "$dst"
      launchctl bootout "$DOMAIN/$label" 2>/dev/null || true
      launchctl bootstrap "$DOMAIN" "$dst"
      echo "✓ $label"
    done
    echo "Log: $LOGS"
    ;;
  uninstall)
    for label in "${LABELS[@]}"; do
      launchctl bootout "$DOMAIN/$label" 2>/dev/null || true
      rm -f "$AGENTS/$label.plist"
      echo "✗ $label"
    done
    ;;
  status)
    for label in "${LABELS[@]}"; do
      if out="$(launchctl print "$DOMAIN/$label" 2>/dev/null)"; then
        state="$(awk -F'= ' '/^\tstate = /{print $2; exit}' <<<"$out")"
        last="$(awk -F'= ' '/last exit code = /{print $2; exit}' <<<"$out")"
        printf "%-22s %-12s last exit: %s\n" "$label" "${state:-?}" "${last:-?}"
      else
        printf "%-22s %s\n" "$label" "chưa cài"
      fi
    done
    ;;
  *)
    echo "usage: $0 install|uninstall|status" >&2; exit 2 ;;
esac
