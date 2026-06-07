#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT/upstream/codex-desktop-linux"

if [ ! -e "$APP_DIR/.git" ]; then
  "$ROOT/scripts/bootstrap-upstream.sh"
fi

cd "$APP_DIR"
PATH="$HOME/.cargo/bin:$PATH" CODEX_LINUX_ENABLE_COMPUTER_USE_UI=1 make build-app
