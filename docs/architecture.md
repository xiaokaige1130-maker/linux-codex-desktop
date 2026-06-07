# Architecture

## Phase 1: Upstream Wrapper First

The first implementation path is `codex-desktop-linux`.

Flow:

1. Download or reuse upstream Codex Desktop DMG.
2. Extract `app.asar`.
3. Patch macOS-specific behavior for Linux.
4. Rebuild native modules for Linux Electron.
5. Stage bundled plugins and Linux feature patches.
6. Run the generated Linux Electron app.

This gives us the closest path to a 1:1 official desktop experience.

## Phase 2: Local Integration Layer

If the upstream wrapper lacks project memory or preference persistence, add a local layer:

- SQLite store for project metadata, summaries, and command history.
- Project detector for package manager, test command, and repo conventions.
- Codex CLI invocation wrapper.
- MCP config generator.

This layer should stay outside the upstream app until we know exactly where to patch.

## Phase 3: Desktop And Browser Control

Prefer upstream Linux Computer Use first.

Fallback stack:

1. `/dev/uinput` direct input path.
2. XDG RemoteDesktop portal.
3. `ydotool` when the distro provides a usable daemon.
4. X11 tools such as `xdotool`, `wmctrl`, and screenshot tools.
5. Playwright/CDP for browser tasks.

## Phase 4: Plugin Compatibility

Expose or generate MCP configuration for:

- Local computer-use backend.
- Browser control.
- Project memory.
- Optional third-party desktop-control services.
