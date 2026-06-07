#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UPSTREAM_DIR="$ROOT/upstream/codex-desktop-linux"
SETTINGS_FILE="${CODEX_LINUX_SETTINGS_FILE:-${XDG_CONFIG_HOME:-$HOME/.config}/codex-desktop/settings.json}"

ok() {
  printf 'ok   %s\n' "$*"
}

warn() {
  printf 'warn %s\n' "$*"
}

miss() {
  printf 'miss %s\n' "$*"
}

need() {
  local name="$1"
  if command -v "$name" >/dev/null 2>&1; then
    ok "$name -> $(command -v "$name")"
  else
    miss "$name"
  fi
}

section() {
  printf '\n%s\n' "$1"
}

section "System"
printf 'user:    %s\n' "$(id -un)"
printf 'uid:     %s\n' "$(id -u)"
printf 'groups:  %s\n' "$(groups)"
printf 'session: %s\n' "${XDG_SESSION_TYPE:-unknown}"
printf 'display: %s\n' "${DISPLAY:-none}"
printf 'wayland: %s\n' "${WAYLAND_DISPLAY:-none}"

section "Repository"
if [ -d "$ROOT/.git" ]; then
  ok "integration repository exists"
  git -C "$ROOT" status --short --branch
else
  miss "integration repository .git"
fi

if [ -e "$UPSTREAM_DIR/.git" ]; then
  ok "upstream checkout exists"
  git -C "$UPSTREAM_DIR" status --short --branch
else
  miss "upstream checkout"
  printf 'fix  ./scripts/bootstrap-upstream.sh\n'
fi

if [ -f "$UPSTREAM_DIR/Codex.dmg" ]; then
  ok "cached Codex.dmg exists"
else
  warn "cached Codex.dmg missing; build scripts can download it"
fi

if [ -x "$UPSTREAM_DIR/codex-app/start.sh" ]; then
  ok "generated app exists"
else
  miss "generated app"
  printf 'fix  ./scripts/build-upstream-app.sh\n'
fi

section "Core Tools"
for tool in git make bash curl unzip 7z node npm npx cargo rustc pkexec zenity; do
  need "$tool"
done

section "Desktop Control"
for tool in xdotool wmctrl import gnome-screenshot ydotool ydotoold; do
  need "$tool"
done

section "Computer Use"
if [ -e /dev/uinput ]; then
  ls -l /dev/uinput
else
  miss "/dev/uinput"
  printf 'fix  ./scripts/configure-linux-input.sh\n'
fi

if id -nG | tr ' ' '\n' | grep -qx input; then
  ok "user is in input group"
else
  miss "user is not in input group"
  printf 'fix  ./scripts/configure-linux-input.sh, then log out and back in\n'
fi

GNOME_EXT="$HOME/.local/share/gnome-shell/extensions/codex-window-control@openai.com"
if [ -d "$GNOME_EXT" ]; then
  ok "GNOME window targeting extension installed"
else
  warn "GNOME window targeting extension not found at $GNOME_EXT"
fi

section "Settings"
if [ -f "$SETTINGS_FILE" ]; then
  ok "settings file -> $SETTINGS_FILE"
  if grep -q '"codex-linux-computer-use-ui-enabled"[[:space:]]*:[[:space:]]*true' "$SETTINGS_FILE"; then
    ok "Computer Use UI enabled"
  else
    warn "Computer Use UI setting is not enabled"
    printf 'fix  ./scripts/enable-computer-use-ui.sh\n'
  fi
  if grep -q '"localeOverride"' "$SETTINGS_FILE"; then
    ok "language override configured"
  else
    warn "language override not configured; app will auto-detect"
  fi
else
  warn "settings file missing -> $SETTINGS_FILE"
  printf 'fix  ./scripts/enable-computer-use-ui.sh\n'
fi

section "Publish Safety"
if git -C "$ROOT" check-ignore --no-index -q "upstream/codex-desktop-linux/Codex.dmg"; then
  ok "parent repo ignores upstream/codex-desktop-linux/Codex.dmg"
else
  warn "parent repo does not ignore upstream/codex-desktop-linux/Codex.dmg"
fi

if [ -e "$UPSTREAM_DIR/.git" ]; then
  for artifact in Codex.dmg Codex.dmg.metadata codex-app/ dist/; do
    if git -C "$UPSTREAM_DIR" check-ignore --no-index -q "$artifact"; then
      ok "upstream repo ignores upstream/codex-desktop-linux/$artifact"
    else
      warn "upstream repo does not ignore upstream/codex-desktop-linux/$artifact"
    fi
  done
else
  warn "cannot verify upstream artifact ignore rules before bootstrap"
fi
