#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT/upstream/codex-desktop-linux"

if [ ! -x "$APP_DIR/codex-app/start.sh" ]; then
  printf 'Generated app is missing. Run ./scripts/build-upstream-app.sh first.\n' >&2
  exit 1
fi

"$ROOT/scripts/project-memory-log.sh" workspace restore >/dev/null 2>&1 || true
"$ROOT/scripts/project-memory-log.sh" refresh --all >/dev/null 2>&1 &

cd "$APP_DIR"
CODEX_LINUX_ENABLE_COMPUTER_USE_UI=1 make run-app
