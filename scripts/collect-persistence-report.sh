#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_ROOT="${1:-$ROOT}"
STATE_HOME="${XDG_STATE_HOME:-$HOME/.local/state}"
REPORT_DIR="$STATE_HOME/linux-codex-desktop/reports"
LOG_FILE="$STATE_HOME/linux-codex-desktop/logs/project-memory-hooks.log"
REPORT_FILE="$REPORT_DIR/persistence-report-$(date -u +%Y%m%dT%H%M%SZ).txt"

mkdir -p "$REPORT_DIR"

section() {
  printf '\n== %s ==\n' "$1"
}

run_section() {
  local title="$1"
  shift
  section "$title"
  "$@" 2>&1 || printf 'command failed: %q\n' "$*"
}

{
  printf 'Linux Codex Desktop persistence report\n'
  printf 'Generated: %s\n' "$(date -Is)"
  printf 'Project:   %s\n' "$PROJECT_ROOT"
  printf 'Repo:      %s\n' "$ROOT"

  run_section "Git Status" git -C "$ROOT" status --short --branch
  run_section "Project Memory Show" "$ROOT/scripts/project-memory.js" show "$PROJECT_ROOT"
  run_section "Persistence Check" "$ROOT/scripts/project-memory.js" persistence check "$PROJECT_ROOT"
  run_section "Workspace Status" "$ROOT/scripts/project-memory.js" workspace status "$PROJECT_ROOT"
  run_section "Backup Verify" "$ROOT/scripts/project-memory.js" backup verify
  run_section "Doctor Project Memory" bash -c "cd '$ROOT' && ./scripts/doctor.sh | sed -n '/Project Memory/,/Desktop App/p'"

  section "Installed Hooks"
  grep -n 'project-memory' "$HOME/.local/bin/codex-desktop" \
    "$HOME/.config/systemd/user/codex-desktop-workspace-restore.service" \
    "$HOME/.config/systemd/user/codex-desktop-backup-on-exit.service" 2>&1 || true

  section "Systemd User Status"
  systemctl --user is-enabled codex-desktop-workspace-restore.service codex-desktop-workspace-restore.path codex-desktop-backup-on-exit.service 2>&1 || true
  systemctl --user is-active codex-desktop-workspace-restore.service codex-desktop-workspace-restore.path codex-desktop-backup-on-exit.service 2>&1 || true

  section "Recent Hook Log"
  if [ -f "$LOG_FILE" ]; then
    tail -n 120 "$LOG_FILE"
  else
    printf 'missing: %s\n' "$LOG_FILE"
  fi
} >"$REPORT_FILE"

printf 'Report: %s\n' "$REPORT_FILE"
