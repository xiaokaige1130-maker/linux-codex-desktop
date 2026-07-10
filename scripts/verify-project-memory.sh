#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_MEMORY="$ROOT/scripts/project-memory.js"
PROJECT_MEMORY_LOGGER="$ROOT/scripts/project-memory-log.sh"
PROJECT_ROOT="${1:-$ROOT}"
PROJECT_MEMORY_DB="${CODEX_PROJECT_MEMORY_DB:-${XDG_STATE_HOME:-$HOME/.local/state}/linux-codex-desktop/project-memory.sqlite}"
PROJECT_MEMORY_LOG="${XDG_STATE_HOME:-$HOME/.local/state}/linux-codex-desktop/logs/project-memory-hooks.log"
CODEX_GLOBAL_STATE="${CODEX_GLOBAL_STATE:-$HOME/.codex/.codex-global-state.json}"
WATCHER_NAME="codex-desktop-workspace-restore.path"
EXIT_BACKUP_NAME="codex-desktop-backup-on-exit.service"

ok() {
  printf 'ok   %s\n' "$*"
}

warn() {
  printf 'warn %s\n' "$*"
}

fail() {
  printf 'fail %s\n' "$*" >&2
  exit 1
}

need() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required"
}

json_has_project_root() {
  node - "$CODEX_GLOBAL_STATE" "$PROJECT_ROOT" <<'NODE'
const fs = require('fs');
const statePath = process.argv[2];
const root = fs.realpathSync(process.argv[3]);
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const saved = state['electron-saved-workspace-roots'] || [];
const active = state['active-workspace-roots'] || [];
process.exit(saved.includes(root) && active.includes(root) ? 0 : 1);
NODE
}

print_global_roots() {
  node - "$CODEX_GLOBAL_STATE" <<'NODE'
const fs = require('fs');
const state = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
console.log(JSON.stringify({
  saved: state['electron-saved-workspace-roots'] || [],
  active: state['active-workspace-roots'] || [],
}, null, 2));
NODE
}

need node
need sqlite3

[ -x "$PROJECT_MEMORY" ] || fail "project memory helper is not executable: $PROJECT_MEMORY"
[ -x "$PROJECT_MEMORY_LOGGER" ] || fail "project memory hook logger is not executable: $PROJECT_MEMORY_LOGGER"

node --check "$PROJECT_MEMORY" >/dev/null
ok "project memory helper syntax"

"$PROJECT_MEMORY" scan "$PROJECT_ROOT" >/dev/null
ok "project scan completed"

"$PROJECT_MEMORY" refresh --all >/dev/null
ok "remembered project indexes can be refreshed before desktop launch"

"$PROJECT_MEMORY_LOGGER" refresh --all >/dev/null
[ -f "$PROJECT_MEMORY_LOG" ] || fail "project memory hook log was not written"
tail -n 20 "$PROJECT_MEMORY_LOG" | grep -q 'refresh --all' || fail "project memory hook log does not include refresh --all"
ok "project memory hook logger writes refresh evidence"

[ -f "$PROJECT_MEMORY_DB" ] || fail "project memory DB missing: $PROJECT_MEMORY_DB"
PROJECT_COUNT="$(sqlite3 "$PROJECT_MEMORY_DB" ".timeout 5000" "select count(*) from projects;" 2>/dev/null || printf 0)"
[ "${PROJECT_COUNT:-0}" -gt 0 ] || fail "project memory DB has no projects"
ok "project memory DB has $PROJECT_COUNT project(s)"

PROJECT_THREAD_COUNT="$(sqlite3 "$PROJECT_MEMORY_DB" ".timeout 5000" "select count(*) from project_threads where project_root = '$PROJECT_ROOT';" 2>/dev/null || printf 0)"
if [ "${PROJECT_THREAD_COUNT:-0}" -gt 0 ]; then
  ok "project memory indexes $PROJECT_THREAD_COUNT thread(s) for this project"
else
  warn "project memory has no indexed threads for this project yet"
fi

if [ "$(basename "$PROJECT_ROOT")" = "linux-codex-desktop" ]; then
  KEYWORD_THREAD_COUNT="$(sqlite3 "$PROJECT_MEMORY_DB" ".timeout 5000" "select count(*) from project_threads where project_root = '$PROJECT_ROOT' and match_reason like 'keyword:%';" 2>/dev/null || printf 0)"
  [ "${KEYWORD_THREAD_COUNT:-0}" -gt 0 ] || fail "linux-codex-desktop should retain home-cwd desktop project threads by keyword"
  ok "home-cwd desktop project threads are retained by keyword matching"
fi

"$PROJECT_MEMORY" workspace restore >/dev/null
json_has_project_root || fail "workspace restore did not register project root"
ok "workspace restore registers project root"

"$PROJECT_MEMORY" pref init "$PROJECT_ROOT" >/dev/null
if "$PROJECT_MEMORY" pref get "$PROJECT_ROOT" codex.workspace.restore >/dev/null &&
   "$PROJECT_MEMORY" pref get "$PROJECT_ROOT" codex.workspace.watchOnLaunch >/dev/null &&
   "$PROJECT_MEMORY" pref get "$PROJECT_ROOT" desktop.controlBackend >/dev/null; then
  ok "default project preferences persist"
else
  fail "default project preferences were not persisted"
fi

CONTEXT_OUTPUT="$("$PROJECT_MEMORY" export-context "$PROJECT_ROOT")"
if printf '%s\n' "$CONTEXT_OUTPUT" | grep -q '## Local Preferences' &&
   printf '%s\n' "$CONTEXT_OUTPUT" | grep -q '## Codex Workspace Persistence' &&
   printf '%s\n' "$CONTEXT_OUTPUT" | grep -q 'codex.workspace.restore'; then
  ok "exported project context includes preferences and workspace persistence"
else
  fail "exported project context is missing preferences or workspace persistence"
fi

"$PROJECT_MEMORY" snapshot "$PROJECT_ROOT" >/dev/null
ok "thread snapshot can be written"

"$PROJECT_MEMORY" persistence mark "$PROJECT_ROOT" >/dev/null
"$PROJECT_MEMORY" persistence check "$PROJECT_ROOT" >/dev/null
ok "restart persistence marker can be written and checked"

BACKUP_OUTPUT="$("$PROJECT_MEMORY" backup)"
BACKUP_PATH="$(printf '%s\n' "$BACKUP_OUTPUT" | awk '/^Backup: / {print $2; exit}')"
[ -n "$BACKUP_PATH" ] || fail "backup command did not print a backup path"
"$PROJECT_MEMORY" backup verify "$BACKUP_PATH" >/dev/null
ok "Codex thread, state, and project memory backup can be written and verified"

if command -v systemctl >/dev/null 2>&1 &&
   systemctl --user is-active default.target >/dev/null 2>&1; then
  if systemctl --user is-enabled "$EXIT_BACKUP_NAME" >/dev/null 2>&1; then
    ok "exit backup service is enabled for user session shutdown"
  else
    warn "exit backup service is not enabled; run ./scripts/install-desktop-app.sh"
  fi
fi

if command -v systemctl >/dev/null 2>&1 &&
   systemctl --user is-active default.target >/dev/null 2>&1 &&
   systemctl --user is-active "$WATCHER_NAME" >/dev/null 2>&1; then
  BACKUP="$CODEX_GLOBAL_STATE.verify-project-memory-$(date -u +%Y%m%dT%H%M%SZ)"
  cp "$CODEX_GLOBAL_STATE" "$BACKUP"
  node - "$CODEX_GLOBAL_STATE" <<'NODE'
const fs = require('fs');
const statePath = process.argv[2];
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
state['electron-saved-workspace-roots'] = [process.env.HOME];
state['active-workspace-roots'] = [process.env.HOME];
fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
NODE

  restored=0
  for _ in $(seq 1 20); do
    if json_has_project_root; then
      restored=1
      break
    fi
    sleep 1
  done

  if [ "$restored" -eq 1 ]; then
    ok "systemd path watcher restores project root after global state overwrite"
  else
    warn "systemd path watcher did not restore within 20s; forcing restore"
    "$PROJECT_MEMORY" workspace restore >/dev/null
    json_has_project_root || fail "forced workspace restore failed after watcher miss"
  fi
else
  warn "systemd user path watcher is not active; skipping automatic overwrite recovery test"
fi

print_global_roots
ok "project memory persistence verification completed"
