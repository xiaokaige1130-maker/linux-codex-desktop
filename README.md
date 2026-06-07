# Linux Codex Desktop

Goal: build a Linux Codex Desktop that gets as close as possible to the official Windows/macOS Codex Desktop experience by reusing public projects first, then filling Linux-specific gaps.

This repository is the local integration workspace. It should not replace upstream projects unless a focused patch is needed. The first upstream target is `ilysenko/codex-desktop-linux`, because it already converts the upstream macOS Codex Desktop app into a Linux Electron app and includes Linux Computer Use plumbing.

## Target Experience

- Desktop app, not only a terminal CLI.
- Open project folders from the UI.
- Load project history and summaries automatically.
- New chats know project context, test commands, package manager preference, and local conventions.
- Call Codex CLI for coding tasks.
- Control browser and desktop on Linux/X11.
- Support MCP/plugin-style extension points.
- Stay as close as possible to official Codex Desktop behavior while accepting that account-gated upstream features cannot be unlocked locally.

## Upstream Strategy

1. Use `ilysenko/codex-desktop-linux` as the base desktop wrapper.
2. Enable its Linux Computer Use UI and backend.
3. Add X11-friendly desktop control fallbacks where needed.
4. Add project memory/session summary glue outside the upstream app first.
5. Add MCP/plugin integrations after the base app runs reliably.

## Local Layout

- `docs/`: architecture notes, upstream matrix, and implementation decisions.
- `scripts/`: local bootstrap, host checks, and wrapper commands.
- `upstream/`: optional local clones/submodules for public upstream projects.

## Quick Start

```bash
./scripts/check-host.sh
./scripts/configure-linux-input.sh
./scripts/bootstrap-upstream.sh
```

Then build or run the upstream wrapper:

```bash
./scripts/build-upstream-app.sh
./scripts/run-upstream-app.sh
```

`build-upstream-app.sh` reuses the cached DMG by default. If a completely fresh upstream download is needed, run this inside the submodule:

```bash
cd upstream/codex-desktop-linux
PATH="$HOME/.cargo/bin:$PATH" CODEX_LINUX_ENABLE_COMPUTER_USE_UI=1 make build-app-fresh
```

For native package install:

```bash
cd upstream/codex-desktop-linux
make bootstrap-native
```

`make bootstrap-native` downloads the upstream app, builds the Linux package, and installs it with system package tooling. Use it after the local generated app path is confirmed.
