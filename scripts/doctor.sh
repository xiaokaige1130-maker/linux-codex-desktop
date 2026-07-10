#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UPSTREAM_DIR="$ROOT/upstream/codex-desktop-linux"
SETTINGS_FILE="${CODEX_LINUX_SETTINGS_FILE:-${XDG_CONFIG_HOME:-$HOME/.config}/codex-desktop/settings.json}"
PROJECT_MEMORY_DB="${CODEX_PROJECT_MEMORY_DB:-${XDG_STATE_HOME:-$HOME/.local/state}/linux-codex-desktop/project-memory.sqlite}"
PROJECT_MEMORY_LOG="${XDG_STATE_HOME:-$HOME/.local/state}/linux-codex-desktop/logs/project-memory-hooks.log"
CODEX_STATE_DB="${CODEX_STATE_DB:-$HOME/.codex/state_5.sqlite}"
CODEX_GLOBAL_STATE="${CODEX_GLOBAL_STATE:-$HOME/.codex/.codex-global-state.json}"
WORKSPACE_RESTORE_SERVICE_NAME="codex-desktop-workspace-restore.service"
WORKSPACE_RESTORE_SERVICE_FILE="$HOME/.config/systemd/user/$WORKSPACE_RESTORE_SERVICE_NAME"
WORKSPACE_RESTORE_PATH_NAME="codex-desktop-workspace-restore.path"
WORKSPACE_RESTORE_PATH_FILE="$HOME/.config/systemd/user/$WORKSPACE_RESTORE_PATH_NAME"
BACKUP_ON_EXIT_SERVICE_NAME="codex-desktop-backup-on-exit.service"
BACKUP_ON_EXIT_SERVICE_FILE="$HOME/.config/systemd/user/$BACKUP_ON_EXIT_SERVICE_NAME"

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

sqlite_value() {
  local db="$1"
  local sql="$2"
  sqlite3 "$db" ".timeout 5000" "$sql" 2>/dev/null || printf 'unknown'
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

section "Project Memory"
if command -v sqlite3 >/dev/null 2>&1; then
  ok "sqlite3 -> $(command -v sqlite3)"
else
  miss "sqlite3"
fi

if [ -x "$ROOT/scripts/project-memory.js" ]; then
  ok "project memory helper -> $ROOT/scripts/project-memory.js"
else
  miss "project memory helper"
fi
if [ -x "$ROOT/scripts/project-memory-log.sh" ]; then
  ok "project memory hook logger -> $ROOT/scripts/project-memory-log.sh"
else
  miss "project memory hook logger"
fi

if [ -f "$PROJECT_MEMORY_DB" ]; then
  ok "project memory DB -> $PROJECT_MEMORY_DB"
  PROJECT_COUNT="$(sqlite_value "$PROJECT_MEMORY_DB" "select count(*) from projects;")"
  THREAD_INDEX_COUNT="$(sqlite_value "$PROJECT_MEMORY_DB" "select count(*) from project_threads;")"
  WORKSPACE_ROOT_COUNT="$(sqlite_value "$PROJECT_MEMORY_DB" "select count(*) from workspace_roots;")"
  PREF_COUNT="$(sqlite_value "$PROJECT_MEMORY_DB" "select count(*) from preferences;")"
  printf 'info remembered projects: %s\n' "$PROJECT_COUNT"
  printf 'info indexed project threads: %s\n' "$THREAD_INDEX_COUNT"
  printf 'info registered workspace roots: %s\n' "$WORKSPACE_ROOT_COUNT"
  printf 'info stored project preferences: %s\n' "$PREF_COUNT"
  if sqlite3 "$PROJECT_MEMORY_DB" ".timeout 5000" "select 1 from preferences where project_root = '$ROOT' and key = 'codex.workspace.restore' limit 1;" 2>/dev/null | grep -q 1 &&
     sqlite3 "$PROJECT_MEMORY_DB" ".timeout 5000" "select 1 from preferences where project_root = '$ROOT' and key = 'codex.workspace.watchOnLaunch' limit 1;" 2>/dev/null | grep -q 1 &&
     sqlite3 "$PROJECT_MEMORY_DB" ".timeout 5000" "select 1 from preferences where project_root = '$ROOT' and key = 'desktop.controlBackend' limit 1;" 2>/dev/null | grep -q 1; then
    ok "this repo has persistent workspace and desktop preferences"
  else
    warn "this repo is missing default project preferences"
    printf 'fix  ./scripts/project-memory.js pref init "%s"\n' "$ROOT"
  fi
  PERSISTENCE_MARKER="${XDG_STATE_HOME:-$HOME/.local/state}/linux-codex-desktop/persistence/$(basename "$ROOT").json"
  if [ -f "$PERSISTENCE_MARKER" ]; then
    ok "restart persistence marker -> $PERSISTENCE_MARKER"
    if "$ROOT/scripts/project-memory.js" persistence check "$ROOT" >/dev/null 2>&1; then
      ok "restart persistence marker verifies project memory, workspace roots, thread index, and backup"
    else
      warn "restart persistence marker check failed"
      printf 'fix  ./scripts/project-memory.js persistence mark "%s" before logout/reboot, then run ./scripts/project-memory.js persistence check "%s" after login\n' "$ROOT" "$ROOT"
    fi
  else
    warn "restart persistence marker missing"
    printf 'fix  ./scripts/project-memory.js persistence mark "%s" before logout/reboot\n' "$ROOT"
  fi
else
  warn "project memory DB missing -> $PROJECT_MEMORY_DB"
  printf 'fix  ./scripts/project-memory.js scan "$PWD"\n'
fi

if [ -f "$PROJECT_MEMORY_LOG" ]; then
  ok "project memory hook log -> $PROJECT_MEMORY_LOG"
  printf 'info hook log bytes: %s\n' "$(wc -c <"$PROJECT_MEMORY_LOG" 2>/dev/null || printf 'unknown')"
  printf 'info latest hook log: %s\n' "$(tail -n 1 "$PROJECT_MEMORY_LOG" 2>/dev/null || printf 'unreadable')"
  printf 'info latest hook result: %s\n' "$(grep -E '\] (ok|fail status=)' "$PROJECT_MEMORY_LOG" 2>/dev/null | tail -n 1 || printf 'none')"
else
  warn "project memory hook log missing -> $PROJECT_MEMORY_LOG"
  printf 'fix  ./scripts/project-memory-log.sh refresh --all\n'
fi

if [ -f "$CODEX_GLOBAL_STATE" ]; then
  ok "Codex global state -> $CODEX_GLOBAL_STATE"
  if node -e "const fs=require('fs'); const p=process.argv[1]; const root=process.argv[2]; const j=JSON.parse(fs.readFileSync(p,'utf8')); const saved=j['electron-saved-workspace-roots']||[]; const active=j['active-workspace-roots']||[]; process.exit(saved.includes(root)&&active.includes(root)?0:1)" "$CODEX_GLOBAL_STATE" "$ROOT"; then
    ok "this repo is registered in Codex workspace roots"
  else
    warn "this repo is not registered in Codex workspace roots"
    printf 'fix  ./scripts/project-memory.js workspace register "%s"\n' "$ROOT"
  fi
else
  warn "Codex global state missing -> $CODEX_GLOBAL_STATE"
fi

if [ -f "$CODEX_STATE_DB" ]; then
  ok "Codex thread metadata DB -> $CODEX_STATE_DB"
  CODEX_THREAD_COUNT="$(sqlite_value "$CODEX_STATE_DB" "select count(*) from threads;")"
  CURRENT_ROOT_THREADS="$(sqlite_value "$PROJECT_MEMORY_DB" "select count(*) from project_threads where project_root = '$ROOT';")"
  printf 'info Codex saved threads: %s\n' "$CODEX_THREAD_COUNT"
  printf 'info remembered threads for this repo: %s\n' "$CURRENT_ROOT_THREADS"
else
  warn "Codex thread metadata DB missing -> $CODEX_STATE_DB"
fi

section "Desktop App"
USER_DESKTOP_FILE="$HOME/.local/share/applications/codex-desktop.desktop"
USER_ICON_FILE="$HOME/.local/share/icons/hicolor/256x256/apps/codex-desktop.png"
USER_BIN_FILE="$HOME/.local/bin/codex-desktop"
if [ -f "$USER_DESKTOP_FILE" ]; then
  ok "desktop launcher installed -> $USER_DESKTOP_FILE"
else
  warn "desktop launcher is not installed"
  printf 'fix  ./scripts/install-desktop-app.sh\n'
fi
if [ -f "$USER_ICON_FILE" ]; then
  ok "desktop icon installed -> $USER_ICON_FILE"
else
  warn "desktop icon is not installed"
  printf 'fix  ./scripts/install-desktop-app.sh\n'
fi
if [ -x "$USER_BIN_FILE" ]; then
  ok "desktop command installed -> $USER_BIN_FILE"
  if grep -q 'refresh --all' "$USER_BIN_FILE"; then
    ok "desktop command refreshes remembered project indexes in the background"
  else
    warn "desktop command does not refresh remembered project indexes before launch"
    printf 'fix  ./scripts/install-desktop-app.sh\n'
  fi
  if grep -q 'workspace restore' "$USER_BIN_FILE"; then
    ok "desktop command restores remembered workspace roots before launch"
  else
    warn "desktop command does not restore remembered workspace roots before launch"
    printf 'fix  ./scripts/install-desktop-app.sh\n'
  fi
  if ! grep -q 'workspace watch' "$USER_BIN_FILE"; then
    ok "desktop command delegates workspace monitoring to the systemd path watcher"
  else
    warn "desktop command still runs a redundant workspace polling loop"
    printf 'fix  ./scripts/install-desktop-app.sh\n'
  fi
else
  warn "desktop command is not installed"
  printf 'fix  ./scripts/install-desktop-app.sh\n'
fi

section "Workspace Restore Service"
if [ -f "$WORKSPACE_RESTORE_SERVICE_FILE" ]; then
  ok "workspace restore service installed -> $WORKSPACE_RESTORE_SERVICE_FILE"
  if grep -q 'workspace restore' "$WORKSPACE_RESTORE_SERVICE_FILE" &&
     ! grep -q 'refresh --all' "$WORKSPACE_RESTORE_SERVICE_FILE" &&
     ! grep -q 'workspace watch' "$WORKSPACE_RESTORE_SERVICE_FILE"; then
    ok "workspace restore service performs a lightweight single restore"
  else
    warn "workspace restore service should perform only a lightweight workspace restore"
    printf 'fix  ./scripts/install-desktop-app.sh\n'
  fi
else
  warn "workspace restore service is not installed"
  printf 'fix  ./scripts/install-desktop-app.sh\n'
fi

if [ -f "$WORKSPACE_RESTORE_PATH_FILE" ]; then
  ok "workspace restore watcher installed -> $WORKSPACE_RESTORE_PATH_FILE"
  if grep -q "$CODEX_GLOBAL_STATE" "$WORKSPACE_RESTORE_PATH_FILE" &&
     grep -q "$WORKSPACE_RESTORE_SERVICE_NAME" "$WORKSPACE_RESTORE_PATH_FILE"; then
    ok "workspace restore watcher monitors Codex global state"
  else
    warn "workspace restore watcher does not monitor Codex global state correctly"
    printf 'fix  ./scripts/install-desktop-app.sh\n'
  fi
else
  warn "workspace restore watcher is not installed"
  printf 'fix  ./scripts/install-desktop-app.sh\n'
fi

if command -v systemctl >/dev/null 2>&1 && systemctl --user is-active default.target >/dev/null 2>&1; then
  if systemctl --user is-enabled "$WORKSPACE_RESTORE_SERVICE_NAME" >/dev/null 2>&1; then
    ok "workspace restore service enabled for user login"
  else
    warn "workspace restore service is not enabled for user login"
    printf 'fix  systemctl --user enable --now %s\n' "$WORKSPACE_RESTORE_SERVICE_NAME"
  fi
  if systemctl --user is-enabled "$WORKSPACE_RESTORE_PATH_NAME" >/dev/null 2>&1; then
    ok "workspace restore watcher enabled for user login"
  else
    warn "workspace restore watcher is not enabled for user login"
    printf 'fix  systemctl --user enable --now %s\n' "$WORKSPACE_RESTORE_PATH_NAME"
  fi
  PATH_STATE="$(systemctl --user is-active "$WORKSPACE_RESTORE_PATH_NAME" 2>/dev/null || true)"
  if [ "$PATH_STATE" = "active" ]; then
    ok "workspace restore watcher state -> $PATH_STATE"
  else
    warn "workspace restore watcher state -> ${PATH_STATE:-unknown}"
    systemctl --user status --no-pager --lines=3 "$WORKSPACE_RESTORE_PATH_NAME" 2>/dev/null || true
  fi
  SERVICE_STATE="$(systemctl --user is-active "$WORKSPACE_RESTORE_SERVICE_NAME" 2>/dev/null || true)"
  if [ "$SERVICE_STATE" = "active" ] || [ "$SERVICE_STATE" = "inactive" ] || [ "$SERVICE_STATE" = "activating" ]; then
    ok "workspace restore service state -> $SERVICE_STATE"
  else
    warn "workspace restore service state -> ${SERVICE_STATE:-unknown}"
    systemctl --user status --no-pager --lines=3 "$WORKSPACE_RESTORE_SERVICE_NAME" 2>/dev/null || true
  fi
  if [ -f "$BACKUP_ON_EXIT_SERVICE_FILE" ]; then
    ok "exit backup service installed -> $BACKUP_ON_EXIT_SERVICE_FILE"
    if grep -q 'backup' "$BACKUP_ON_EXIT_SERVICE_FILE" &&
       grep -q '^ExecStop=' "$BACKUP_ON_EXIT_SERVICE_FILE"; then
      ok "exit backup service backs up Codex state when the user session stops"
    else
      warn "exit backup service is missing ExecStop backup command"
      printf 'fix  ./scripts/install-desktop-app.sh\n'
    fi
    if systemctl --user is-enabled "$BACKUP_ON_EXIT_SERVICE_NAME" >/dev/null 2>&1; then
      ok "exit backup service enabled for user session shutdown"
    else
      warn "exit backup service is not enabled"
      printf 'fix  systemctl --user enable --now %s\n' "$BACKUP_ON_EXIT_SERVICE_NAME"
    fi
    EXIT_BACKUP_STATE="$(systemctl --user is-active "$BACKUP_ON_EXIT_SERVICE_NAME" 2>/dev/null || true)"
    if [ "$EXIT_BACKUP_STATE" = "active" ] || [ "$EXIT_BACKUP_STATE" = "inactive" ]; then
      ok "exit backup service state -> $EXIT_BACKUP_STATE"
    else
      warn "exit backup service state -> ${EXIT_BACKUP_STATE:-unknown}"
      systemctl --user status --no-pager --lines=3 "$BACKUP_ON_EXIT_SERVICE_NAME" 2>/dev/null || true
    fi
  else
    warn "exit backup service is not installed"
    printf 'fix  ./scripts/install-desktop-app.sh\n'
  fi
else
  warn "systemd user manager is not available; login restore service cannot be verified"
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
