#!/usr/bin/env bash
set -euo pipefail

USER_NAME="${SUDO_USER:-$(id -un)}"
RULE='/etc/udev/rules.d/99-codex-uinput.rules'

sudo usermod -a -G input "$USER_NAME"

printf 'KERNEL=="uinput", GROUP="input", MODE="0660", OPTIONS+="static_node=uinput"\n' \
  | sudo tee "$RULE" >/dev/null

sudo modprobe uinput
sudo udevadm control --reload-rules
sudo udevadm trigger --subsystem-match=misc --attr-match=name=uinput || true

if [ -e /dev/uinput ]; then
  sudo chgrp input /dev/uinput || true
  sudo chmod 0660 /dev/uinput || true
  ls -l /dev/uinput
else
  printf 'warning: /dev/uinput does not exist after modprobe\n' >&2
fi

printf '\nUser %s was added to input group. Log out and back in before relying on group-based access in desktop apps.\n' "$USER_NAME"
