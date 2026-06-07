#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT/upstream/codex-desktop-linux"
GENERATED_APP="$APP_DIR/codex-app"
START_SCRIPT="$GENERATED_APP/start.sh"
ICON_SOURCE="$GENERATED_APP/.codex-linux/codex-desktop.png"
FALLBACK_ICON_SOURCE="$APP_DIR/assets/codex.png"
APP_ID="codex-desktop"
DESKTOP_FILE="$HOME/.local/share/applications/$APP_ID.desktop"
ICON_TARGET="$HOME/.local/share/icons/hicolor/256x256/apps/$APP_ID.png"
BIN_TARGET="$HOME/.local/bin/$APP_ID"

if [ ! -x "$START_SCRIPT" ]; then
  printf 'Generated app is missing. Run ./scripts/build-upstream-app.sh first.\n' >&2
  exit 1
fi

if [ ! -f "$ICON_SOURCE" ]; then
  ICON_SOURCE="$FALLBACK_ICON_SOURCE"
fi

if [ ! -f "$ICON_SOURCE" ]; then
  printf 'Codex icon is missing. Expected %s or %s\n' \
    "$GENERATED_APP/.codex-linux/codex-desktop.png" \
    "$FALLBACK_ICON_SOURCE" >&2
  exit 1
fi

mkdir -p "$(dirname "$DESKTOP_FILE")" "$(dirname "$ICON_TARGET")" "$(dirname "$BIN_TARGET")"
install -m 0644 "$ICON_SOURCE" "$ICON_TARGET"

cat > "$BIN_TARGET" <<EOF
#!/usr/bin/env bash
set -euo pipefail
export CODEX_LINUX_ENABLE_COMPUTER_USE_UI="\${CODEX_LINUX_ENABLE_COMPUTER_USE_UI:-1}"
export BAMF_DESKTOP_FILE_HINT="$DESKTOP_FILE"
export CHROME_DESKTOP="$APP_ID.desktop"
exec "$START_SCRIPT" "\$@"
EOF
chmod 0755 "$BIN_TARGET"

cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Name=Codex Desktop
Name[zh_CN]=Codex 桌面版
Comment=Run Codex Desktop on Linux
Comment[zh_CN]=在 Linux 上运行 Codex 桌面版
Exec=$BIN_TARGET %u
TryExec=$BIN_TARGET
Icon=$APP_ID
Terminal=false
Type=Application
Categories=Development;IDE;
MimeType=x-scheme-handler/codex;x-scheme-handler/codex-browser-sidebar;
StartupNotify=true
StartupWMClass=codex-desktop
X-GNOME-WMClass=codex-desktop
Actions=new-window;

[Desktop Action new-window]
Name=New Window
Name[zh_CN]=新窗口
Exec=env CODEX_MULTI_LAUNCH=1 $BIN_TARGET --new-instance
EOF
chmod 0644 "$DESKTOP_FILE"

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$HOME/.local/share/applications" >/dev/null 2>&1 || true
fi

if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -q "$HOME/.local/share/icons/hicolor" >/dev/null 2>&1 || true
fi

if command -v xdg-mime >/dev/null 2>&1; then
  xdg-mime default "$APP_ID.desktop" x-scheme-handler/codex >/dev/null 2>&1 || true
  xdg-mime default "$APP_ID.desktop" x-scheme-handler/codex-browser-sidebar >/dev/null 2>&1 || true
fi

printf 'Installed desktop app:\n'
printf '  launcher: %s\n' "$DESKTOP_FILE"
printf '  icon:     %s\n' "$ICON_TARGET"
printf '  command:  %s\n' "$BIN_TARGET"
printf '\nOpen it from your app menu as "Codex Desktop", or run:\n'
printf '  gtk-launch %s\n' "$APP_ID"
