#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const script = path.join(__dirname, "project-memory.js");

function withFixture(runTest) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-project-memory-test-"));
  const home = path.join(root, "home");
  const project = path.join(root, "project");
  const stateDir = path.join(root, "state");
  const codexDir = path.join(home, ".codex");
  fs.mkdirSync(project, { recursive: true });
  fs.mkdirSync(codexDir, { recursive: true });
  fs.writeFileSync(path.join(project, "README.md"), "# Fixture\n");
  fs.writeFileSync(
    path.join(codexDir, ".codex-global-state.json"),
    `${JSON.stringify({ "electron-saved-workspace-roots": [], "active-workspace-roots": [] }, null, 2)}\n`,
  );

  const env = {
    ...process.env,
    HOME: home,
    XDG_STATE_HOME: stateDir,
    CODEX_PROJECT_MEMORY_DB: path.join(stateDir, "project-memory.sqlite"),
    CODEX_STATE_DB: path.join(codexDir, "missing-state.sqlite"),
    CODEX_MEMORY_DB: path.join(codexDir, "missing-memories.sqlite"),
    CODEX_GLOBAL_STATE: path.join(codexDir, ".codex-global-state.json"),
  };

  function run(args, options = {}) {
    return childProcess.spawnSync(process.execPath, [script, ...args], {
      cwd: project,
      env,
      encoding: "utf8",
      timeout: 3000,
      ...options,
    });
  }

  try {
    runTest({ codexDir, env, project, run, stateDir });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("project refresh does not create per-project global-state backups", () => {
  withFixture(({ codexDir, project, run }) => {
    const result = run(["refresh", project]);
    assert.equal(result.status, 0, result.stderr);

    const backups = fs.readdirSync(codexDir).filter((name) =>
      name.startsWith(".codex-global-state.json.bak-"),
    );
    assert.deepEqual(backups, []);
  });
});

test("workspace restore recovers an abandoned lock", () => {
  withFixture(({ project, run, stateDir }) => {
    const first = run(["refresh", project]);
    assert.equal(first.status, 0, first.stderr);

    const lock = path.join(stateDir, "locks", "workspace-state.lock");
    fs.mkdirSync(lock, { recursive: true });
    fs.writeFileSync(path.join(lock, "owner.json"), JSON.stringify({ pid: 99999999 }));

    const result = run(["workspace", "restore"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Changed: no/);
  });
});

test("workspace registration retains only the newest global-state backups", () => {
  withFixture(({ codexDir, project, run }) => {
    const statePath = path.join(codexDir, ".codex-global-state.json");
    for (let index = 0; index < 25; index += 1) {
      const suffix = String(index).padStart(2, "0");
      fs.writeFileSync(`${statePath}.bak-2026-01-01T00-00-${suffix}-000Z`, "{}\n");
    }

    const result = run(["workspace", "register", project]);
    assert.equal(result.status, 0, result.stderr);

    const backups = fs.readdirSync(codexDir).filter((name) =>
      name.startsWith(".codex-global-state.json.bak-"),
    );
    assert.equal(backups.length, 20);
    assert.ok(backups.every((name) => !name.includes("00-00-00-000Z")));
  });
});

test("backup prune-global-state removes historical loose backups without creating a new one", () => {
  withFixture(({ codexDir, run }) => {
    const statePath = path.join(codexDir, ".codex-global-state.json");
    for (let index = 0; index < 25; index += 1) {
      const suffix = String(index).padStart(2, "0");
      fs.writeFileSync(`${statePath}.bak-2026-01-01T00-00-${suffix}-000Z`, "{}\n");
    }

    const result = run(["backup", "prune-global-state", "--keep", "20"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Pruned global-state backups: 5/);

    const backups = fs.readdirSync(codexDir).filter((name) =>
      name.startsWith(".codex-global-state.json.bak-"),
    );
    assert.equal(backups.length, 20);
  });
});
