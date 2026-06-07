#!/usr/bin/env bash
set -euo pipefail

mkdir -p "$HOME/.config/codex-desktop"
SETTINGS_FILE="$HOME/.config/codex-desktop/settings.json"

node - "$SETTINGS_FILE" <<'NODE'
const fs = require("node:fs");
const path = process.argv[2];
let settings = {};
try {
  settings = JSON.parse(fs.readFileSync(path, "utf8"));
} catch {
  settings = {};
}
settings["codex-linux-computer-use-ui-enabled"] = true;
fs.writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`);
NODE

printf 'Enabled Codex Linux Computer Use UI in %s\n' "$SETTINGS_FILE"
