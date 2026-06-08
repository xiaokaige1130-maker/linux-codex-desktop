#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_ROOT="${2:-$ROOT}"
PROJECT_MEMORY="$ROOT/scripts/project-memory.js"
LOG_FILE="${XDG_STATE_HOME:-$HOME/.local/state}/linux-codex-desktop/logs/project-memory-hooks.log"

usage() {
  cat <<EOF
Usage:
  ./scripts/test-restart-persistence.sh mark [project-root]
  ./scripts/test-restart-persistence.sh check [project-root]
  ./scripts/test-restart-persistence.sh status [project-root]

Run "mark" before logout/reboot, then run "check" after logging back in.
EOF
}

ACTION="${1:-}"
if [ -z "$ACTION" ] || [ "$ACTION" = "-h" ] || [ "$ACTION" = "--help" ]; then
  usage
  exit 0
fi

case "$ACTION" in
  mark)
    "$PROJECT_MEMORY" refresh --all >/dev/null
    "$PROJECT_MEMORY" persistence mark "$PROJECT_ROOT"
    printf '\nAfter logout/reboot and opening Codex Desktop, run:\n'
    printf '  %s check %q\n' "$0" "$PROJECT_ROOT"
    ;;
  check)
    "$PROJECT_MEMORY" refresh --all >/dev/null
    "$PROJECT_MEMORY" persistence check "$PROJECT_ROOT"
    printf '\nDoctor summary:\n'
    "$ROOT/scripts/doctor.sh" | sed -n '/Project Memory/,/Desktop App/p'
    ;;
  status)
    "$PROJECT_MEMORY" show "$PROJECT_ROOT"
    printf '\nPersistence check:\n'
    "$PROJECT_MEMORY" persistence check "$PROJECT_ROOT"
    if [ -f "$LOG_FILE" ]; then
      printf '\nLatest hook log:\n'
      tail -n 40 "$LOG_FILE"
    fi
    ;;
  *)
    usage >&2
    exit 1
    ;;
esac
