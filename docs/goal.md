# Project Goal

One sentence:

Build a Linux desktop application that reuses public projects to replicate the official Windows/macOS Codex Desktop experience as closely as possible, including desktop UI, project memory, Codex CLI integration, browser/desktop control, and MCP/plugin capability.

## Non-Goals For The First Pass

- Do not build a fresh Electron clone before proving the upstream wrapper path.
- Do not try to bypass OpenAI server-side account gates.
- Do not run the whole Electron app as root by default.
- Do not mix unrelated desktop-agent projects into the critical path before the base Codex Desktop wrapper runs.

## Permission Model

The app should run as the normal desktop user. Elevated operations should use `sudo`, `pkexec`, system services, or narrow helper binaries. This keeps day-to-day desktop automation broad while avoiding a permanently root Electron process.
