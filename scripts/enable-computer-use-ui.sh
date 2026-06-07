#!/usr/bin/env bash
set -euo pipefail

mkdir -p "$HOME/.config/codex-desktop"
cat > "$HOME/.config/codex-desktop/settings.json" <<'JSON'
{
  "codex-linux-computer-use-ui-enabled": true
}
JSON

printf 'Enabled Codex Linux Computer Use UI in %s\n' "$HOME/.config/codex-desktop/settings.json"
