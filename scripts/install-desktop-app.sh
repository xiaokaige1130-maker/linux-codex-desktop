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
SYSTEMD_USER_DIR="$HOME/.config/systemd/user"
WORKSPACE_RESTORE_SERVICE="$SYSTEMD_USER_DIR/codex-desktop-workspace-restore.service"
WORKSPACE_RESTORE_PATH="$SYSTEMD_USER_DIR/codex-desktop-workspace-restore.path"
BACKUP_ON_EXIT_SERVICE="$SYSTEMD_USER_DIR/codex-desktop-backup-on-exit.service"

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

mkdir -p "$(dirname "$DESKTOP_FILE")" "$(dirname "$ICON_TARGET")" "$(dirname "$BIN_TARGET")" "$SYSTEMD_USER_DIR"
install -m 0644 "$ICON_SOURCE" "$ICON_TARGET"

cat > "$BIN_TARGET" <<EOF
#!/usr/bin/env bash
set -euo pipefail
export CODEX_LINUX_ENABLE_COMPUTER_USE_UI="\${CODEX_LINUX_ENABLE_COMPUTER_USE_UI:-1}"
export NPM_CONFIG_CACHE="\${NPM_CONFIG_CACHE:-\${XDG_CACHE_HOME:-\$HOME/.cache}/codex-desktop/npm}"
export BAMF_DESKTOP_FILE_HINT="$DESKTOP_FILE"
export CHROME_DESKTOP="$APP_ID.desktop"
"$ROOT/scripts/project-memory-log.sh" workspace restore >/dev/null 2>&1 || true
"$ROOT/scripts/project-memory-log.sh" refresh --all >/dev/null 2>&1 &
exec "$START_SCRIPT" "\$@"
EOF
chmod 0755 "$BIN_TARGET"

cat > "$WORKSPACE_RESTORE_SERVICE" <<EOF
[Unit]
Description=Restore remembered Codex Desktop workspace roots
After=default.target

[Service]
Type=oneshot
ExecStart=$ROOT/scripts/project-memory-log.sh workspace restore

[Install]
WantedBy=default.target
EOF
chmod 0644 "$WORKSPACE_RESTORE_SERVICE"

cat > "$WORKSPACE_RESTORE_PATH" <<EOF
[Unit]
Description=Watch Codex Desktop workspace state for restore

[Path]
PathChanged=$HOME/.codex/.codex-global-state.json
Unit=codex-desktop-workspace-restore.service

[Install]
WantedBy=default.target
EOF
chmod 0644 "$WORKSPACE_RESTORE_PATH"

cat > "$BACKUP_ON_EXIT_SERVICE" <<EOF
[Unit]
Description=Back up Codex Desktop state before user session exits
DefaultDependencies=no
Before=shutdown.target exit.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/bin/true
ExecStop=$ROOT/scripts/project-memory-log.sh backup

[Install]
WantedBy=default.target
EOF
chmod 0644 "$BACKUP_ON_EXIT_SERVICE"

cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Name=Codex Desktop
Name[zh_CN]=Codex 桌面版
Comment=Run Codex Desktop on Linux
Comment[zh_CN]=在 Linux 上运行 Codex 桌面版
Exec=$BIN_TARGET %u
TryExec=$BIN_TARGET
Icon=$ICON_TARGET
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

if command -v systemctl >/dev/null 2>&1 && systemctl --user is-active default.target >/dev/null 2>&1; then
  systemctl --user daemon-reload >/dev/null 2>&1 || true
  systemctl --user enable --now codex-desktop-workspace-restore.service >/dev/null 2>&1 || true
  systemctl --user enable --now codex-desktop-workspace-restore.path >/dev/null 2>&1 || true
  systemctl --user enable --now codex-desktop-backup-on-exit.service >/dev/null 2>&1 || true
fi

printf 'Installed desktop app:\n'
printf '  launcher: %s\n' "$DESKTOP_FILE"
printf '  icon:     %s\n' "$ICON_TARGET"
printf '  command:  %s\n' "$BIN_TARGET"
printf '  service:  %s\n' "$WORKSPACE_RESTORE_SERVICE"
printf '  watcher:  %s\n' "$WORKSPACE_RESTORE_PATH"
printf '  exit backup: %s\n' "$BACKUP_ON_EXIT_SERVICE"
printf '\nOpen it from your app menu as "Codex Desktop", or run:\n'
printf '  gtk-launch %s\n' "$APP_ID"
