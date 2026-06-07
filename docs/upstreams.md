# Public Upstreams

## Priority 1: codex-desktop-linux

URL: https://github.com/ilysenko/codex-desktop-linux

Role: primary base.

Useful capabilities:

- Converts upstream macOS `Codex.dmg` into a Linux Electron app.
- Builds `.deb`, `.rpm`, `.pkg.tar.zst`, AppImage, and Nix outputs.
- Integrates Codex CLI runtime.
- Stages Chrome plugin native host.
- Includes browser annotations.
- Includes Linux Computer Use backend as a bundled MCP backend.
- Supports X11 and Wayland.
- Has optional Linux feature framework.

Known limits:

- Unofficial project.
- Cannot unlock OpenAI account/server-gated features.
- Requires upstream app assets from the official macOS DMG.
- Computer Use input may require `/dev/uinput`, portal support, or `ydotool`.

Recommended use:

- Treat as upstream base.
- Keep local changes in this integration repo until we know whether patches should go upstream.
- Build with `CODEX_LINUX_ENABLE_COMPUTER_USE_UI=1` for Computer Use UI testing.

## Priority 2: Touchpoint

URL: https://github.com/Touchpoint-Labs/touchpoint

Role: optional desktop-control/MCP layer if upstream Computer Use is insufficient.

Useful capabilities:

- Linux X11 desktop automation.
- AT-SPI accessibility tree usage.
- MCP server and Python API.
- Structured element/window/screenshot actions.
- Input through `xdotool`.
- Browser and Electron Web content through CDP.

Recommended use:

- Evaluate after `codex-desktop-linux` runs.
- Use only for gaps not already covered by Linux Computer Use.

## Priority 3: deskctl

URL: https://www.deskctl.dev/

Role: optional deterministic X11 control primitive layer.

Useful capabilities:

- Non-interactive CLI designed for agent loops.
- `doctor`, `snapshot`, `list-windows`, `focus`, `click`, `type`, `hotkey`, and `wait`.
- JSON output.
- X11/EWMH window-manager control.

Known limits:

- X11 only.
- Does not provide an AT-SPI semantic tree.

Recommended use:

- Combine with Touchpoint if the built-in Linux Computer Use backend needs stronger X11 primitives.
- Keep as a fallback until the upstream Codex Computer Use path is measured.

## Priority 4: Agentify Desktop

URL: https://github.com/agentify-sh/desktop

Role: optional browser-session/tooling bridge.

Useful capabilities:

- Desktop bridge for existing logged-in web AI sessions.
- MCP-style browser/tool access.
- Multi-tab web AI session control.
- File upload and artifact save workflows.

Recommended use:

- Use later if we need durable browser sessions or web-app control beyond Codex Desktop's built-in browser/plugin path.

## Lower Priority References

### DesktopCtl

URL: https://github.com/yaroshevych/desktopctl

Role: reference only for now.

Known limit: current public implementation is macOS-first.

Recommended use:

- Borrow ideas such as CLI/daemon separation and JSON contracts, but do not use as a Linux dependency yet.

### Relaygent

URL: https://github.com/prestoj/relaygent

Role: reference for long-running agent dashboard, VNC/noVNC, MCP management, and handoff.

Known limit: security surface is large and it is not a Codex Desktop clone.

### agent-desktop

URL: https://github.com/lahfir/agent-desktop

Role: reference for structured snapshot/ref API design.

Known limit: Linux support is currently planned rather than ready.

### TuriX-CUA

URL: https://github.com/TurixAI/TuriX-CUA

Role: reference for VLM computer-use planning.

Known limit: not a Linux desktop integration SDK and not a Codex Desktop clone.
