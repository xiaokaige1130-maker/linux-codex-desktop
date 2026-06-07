#!/usr/bin/env bash
set -euo pipefail

LANGUAGE="${1:-}"
SETTINGS_FILE="${CODEX_LINUX_SETTINGS_FILE:-$HOME/.config/codex-desktop/settings.json}"

usage() {
  cat <<'USAGE'
Usage:
  ./scripts/set-language.sh auto
  ./scripts/set-language.sh en
  ./scripts/set-language.sh zh-CN

Common values:
  auto   remove the override and let Codex Desktop auto-detect
  en     English
  zh-CN  Simplified Chinese
USAGE
}

if [ -z "$LANGUAGE" ] || [ "$LANGUAGE" = "-h" ] || [ "$LANGUAGE" = "--help" ]; then
  usage
  exit 0
fi

mkdir -p "$(dirname "$SETTINGS_FILE")"

node - "$SETTINGS_FILE" "$LANGUAGE" <<'NODE'
const fs = require("node:fs");
const file = process.argv[2];
const language = process.argv[3];
let settings = {};
try {
  settings = JSON.parse(fs.readFileSync(file, "utf8"));
} catch {
  settings = {};
}
if (language === "auto") {
  delete settings.localeOverride;
} else {
  settings.localeOverride = language;
}
fs.writeFileSync(file, `${JSON.stringify(settings, null, 2)}\n`);
NODE

if [ "$LANGUAGE" = "auto" ]; then
  printf 'Language override removed from %s\n' "$SETTINGS_FILE"
else
  printf 'Language override set to %s in %s\n' "$LANGUAGE" "$SETTINGS_FILE"
fi
