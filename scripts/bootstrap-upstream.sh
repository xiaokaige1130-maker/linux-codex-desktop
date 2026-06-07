#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UPSTREAM_DIR="$ROOT/upstream/codex-desktop-linux"
SOURCE_SIBLING="/home/hyk/codex-desktop-linux"
URL="https://github.com/ilysenko/codex-desktop-linux.git"

mkdir -p "$ROOT/upstream"

if [ -e "$UPSTREAM_DIR/.git" ]; then
  git -C "$UPSTREAM_DIR" pull --ff-only
elif [ -d "$SOURCE_SIBLING/.git" ]; then
  git clone "$SOURCE_SIBLING" "$UPSTREAM_DIR"
  git -C "$UPSTREAM_DIR" remote set-url origin "$URL"
else
  git clone "$URL" "$UPSTREAM_DIR"
fi

printf 'Upstream ready: %s\n' "$UPSTREAM_DIR"
git -C "$UPSTREAM_DIR" status --short --branch
