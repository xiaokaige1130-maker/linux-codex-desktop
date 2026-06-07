#!/usr/bin/env bash
set -euo pipefail

need() {
  local name="$1"
  if command -v "$name" >/dev/null 2>&1; then
    printf 'ok   %s -> %s\n' "$name" "$(command -v "$name")"
  else
    printf 'miss %s\n' "$name"
  fi
}

printf 'System\n'
printf '  user: %s\n' "$(id -un)"
printf '  uid: %s\n' "$(id -u)"
printf '  groups: %s\n' "$(groups)"
printf '  session: %s\n' "${XDG_SESSION_TYPE:-unknown}"
printf '  display: %s\n' "${DISPLAY:-none}"
printf '\n'

printf 'Core tools\n'
for tool in git make bash curl unzip 7z dpkg-deb node npm npx pnpm cargo rustc pkexec zenity; do
  need "$tool"
done
printf '\n'

printf 'Desktop/browser control tools\n'
for tool in xdotool wmctrl import gnome-screenshot ydotool ydotoold playwright; do
  need "$tool"
done
printf '\n'

printf 'Computer Use readiness hints\n'
if [ -e /dev/uinput ]; then
  ls -l /dev/uinput
else
  printf 'miss /dev/uinput\n'
fi

if id -nG | tr ' ' '\n' | grep -qx input; then
  printf 'ok   user is in input group\n'
else
  printf 'miss user is not in input group\n'
fi
