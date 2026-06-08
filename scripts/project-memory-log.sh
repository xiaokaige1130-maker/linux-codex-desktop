#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_HOME="${XDG_STATE_HOME:-$HOME/.local/state}"
LOG_DIR="$STATE_HOME/linux-codex-desktop/logs"
LOG_FILE="$LOG_DIR/project-memory-hooks.log"
MAX_BYTES="${CODEX_PROJECT_MEMORY_LOG_MAX_BYTES:-1048576}"
KEEP_LINES="${CODEX_PROJECT_MEMORY_LOG_KEEP_LINES:-500}"

mkdir -p "$LOG_DIR"

rotate_log_if_needed() {
  if [ ! -f "$LOG_FILE" ]; then
    return
  fi
  local size
  size="$(wc -c <"$LOG_FILE" 2>/dev/null || printf 0)"
  if [ "${size:-0}" -le "$MAX_BYTES" ]; then
    return
  fi
  local tmp
  tmp="$LOG_FILE.tmp.$$"
  {
    printf '[%s] log truncated; previous_bytes=%s keep_lines=%s\n' "$(date -Is)" "$size" "$KEEP_LINES"
    tail -n "$KEEP_LINES" "$LOG_FILE" 2>/dev/null || true
  } >"$tmp"
  mv "$tmp" "$LOG_FILE"
}

rotate_log_if_needed

{
  printf '[%s] start' "$(date -Is)"
  printf ' %q' "$ROOT/scripts/project-memory.js" "$@"
  printf '\n'
} >>"$LOG_FILE"

if "$ROOT/scripts/project-memory.js" "$@" >>"$LOG_FILE" 2>&1; then
  printf '[%s] ok\n' "$(date -Is)" >>"$LOG_FILE"
else
  status=$?
  printf '[%s] fail status=%s\n' "$(date -Is)" "$status" >>"$LOG_FILE"
  exit "$status"
fi
