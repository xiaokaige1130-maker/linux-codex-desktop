#!/usr/bin/env bash
set -euo pipefail

APP_ID="codex-desktop"
DESKTOP_FILE="$HOME/.local/share/applications/$APP_ID.desktop"
ICON_TARGET="$HOME/.local/share/icons/hicolor/256x256/apps/$APP_ID.png"
BIN_TARGET="$HOME/.local/bin/$APP_ID"

removed=0
for path in "$DESKTOP_FILE" "$ICON_TARGET" "$BIN_TARGET"; do
  if [ -e "$path" ]; then
    rm -f "$path"
    printf 'removed %s\n' "$path"
    removed=1
  fi
done

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$HOME/.local/share/applications" >/dev/null 2>&1 || true
fi

if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -q "$HOME/.local/share/icons/hicolor" >/dev/null 2>&1 || true
fi

if [ "$removed" -eq 0 ]; then
  printf 'No user desktop app files were installed for %s.\n' "$APP_ID"
else
  printf 'Uninstalled user desktop app files for %s.\n' "$APP_ID"
fi

printf 'Generated app files under upstream/codex-desktop-linux/codex-app were not removed.\n'
