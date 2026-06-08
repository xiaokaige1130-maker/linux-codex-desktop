#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const childProcess = require('child_process');

const APP_NAME = 'linux-codex-desktop';
const DEFAULT_DB = path.join(
  process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state'),
  APP_NAME,
  'project-memory.sqlite',
);
const CODEX_STATE_DB = path.join(os.homedir(), '.codex', 'state_5.sqlite');
const CODEX_MEMORY_DB = path.join(os.homedir(), '.codex', 'memories_1.sqlite');
const CODEX_GLOBAL_STATE = path.join(os.homedir(), '.codex', '.codex-global-state.json');

function usage(exitCode = 0) {
  const out = exitCode === 0 ? process.stdout : process.stderr;
  out.write(`Usage:
  scripts/project-memory.js scan [project-root]
  scripts/project-memory.js refresh [project-root]
  scripts/project-memory.js refresh --all
  scripts/project-memory.js show [project-root]
  scripts/project-memory.js list
  scripts/project-memory.js threads [project-root]
  scripts/project-memory.js summaries [project-root]
  scripts/project-memory.js snapshot [project-root]
  scripts/project-memory.js workspace status [project-root]
  scripts/project-memory.js workspace register [project-root]
  scripts/project-memory.js workspace restore
  scripts/project-memory.js workspace watch [--duration seconds] [--interval seconds]
  scripts/project-memory.js backup [--keep count]
  scripts/project-memory.js backup list
  scripts/project-memory.js backup verify [backup-dir]
  scripts/project-memory.js pref get [project-root] [key]
  scripts/project-memory.js pref set [project-root] [key] [value]
  scripts/project-memory.js pref list [project-root]
  scripts/project-memory.js pref init [project-root]
  scripts/project-memory.js persistence mark [project-root]
  scripts/project-memory.js persistence check [project-root]
  scripts/project-memory.js export-context [project-root]

Environment:
  CODEX_PROJECT_MEMORY_DB   Override memory DB path.
  CODEX_STATE_DB            Override Codex thread metadata DB path.
  CODEX_MEMORY_DB           Override Codex generated memory DB path.
  CODEX_GLOBAL_STATE        Override Codex Electron global state path.
`);
  process.exit(exitCode);
}

function run(command, args, options = {}) {
  const result = childProcess.spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
  if (result.status !== 0) {
    return null;
  }
  return result.stdout.trim();
}

function runSql(dbPath, sql) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const args = [dbPath, '-batch', '-cmd', '.timeout 5000', '-cmd', '.mode json', sql];
  const result = childProcess.spawnSync('sqlite3', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `sqlite3 failed with status ${result.status}`);
  }
  const text = result.stdout.trim();
  return text ? JSON.parse(text) : [];
}

function runSqlExec(dbPath, sql) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const result = childProcess.spawnSync('sqlite3', [dbPath, '-batch'], {
    input: `.timeout 5000\n${sql}`,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `sqlite3 failed with status ${result.status}`);
  }
}

function shellQuoteSql(value) {
  return String(value ?? '').replaceAll("'", "''");
}

function sqlString(value) {
  return `'${shellQuoteSql(value)}'`;
}

function ensureDb(dbPath) {
  runSqlExec(dbPath, `
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS projects (
  root TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  detected_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  git_branch TEXT NOT NULL DEFAULT '',
  git_origin_url TEXT NOT NULL DEFAULT '',
  git_sha TEXT NOT NULL DEFAULT '',
  primary_language TEXT NOT NULL DEFAULT '',
  frameworks_json TEXT NOT NULL DEFAULT '[]',
  package_manager TEXT NOT NULL DEFAULT '',
  commands_json TEXT NOT NULL DEFAULT '{}',
  manifests_json TEXT NOT NULL DEFAULT '[]',
  summary TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS project_threads (
  project_root TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  preview TEXT NOT NULL DEFAULT '',
  cwd TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  match_reason TEXT NOT NULL DEFAULT '',
  archived INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (project_root, thread_id)
);
CREATE TABLE IF NOT EXISTS thread_summaries (
  project_root TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  rollout_summary TEXT NOT NULL DEFAULT '',
  raw_memory TEXT NOT NULL DEFAULT '',
  generated_at TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (project_root, thread_id)
);
CREATE TABLE IF NOT EXISTS preferences (
  project_root TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project_root, key)
);
CREATE TABLE IF NOT EXISTS workspace_roots (
  project_root TEXT PRIMARY KEY,
  registered_at TEXT NOT NULL,
  global_state_path TEXT NOT NULL DEFAULT '',
  saved INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_project_threads_updated_at
  ON project_threads(project_root, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_thread_summaries_generated_at
  ON thread_summaries(project_root, generated_at DESC);
`);
  ensureColumn(dbPath, 'project_threads', 'match_reason', "TEXT NOT NULL DEFAULT ''");
}

function ensureColumn(dbPath, tableName, columnName, definition) {
  const columns = runSql(dbPath, `PRAGMA table_info(${tableName});`);
  if (columns.some((column) => column.name === columnName)) return;
  runSqlExec(dbPath, `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition};`);
}

function realRoot(inputPath) {
  const target = path.resolve(inputPath || process.cwd());
  if (!fs.existsSync(target)) {
    throw new Error(`project root does not exist: ${target}`);
  }
  const stat = fs.statSync(target);
  const dir = stat.isDirectory() ? target : path.dirname(target);
  return fs.realpathSync(dir);
}

function fileExists(root, relative) {
  return fs.existsSync(path.join(root, relative));
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function readFirstLines(filePath, maxLines = 8) {
  try {
    return fs
      .readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, maxLines)
      .join(' ');
  } catch {
    return '';
  }
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function compactJson(value) {
  return JSON.stringify(value, null, 2);
}

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function lockDir() {
  return path.join(path.dirname(process.env.CODEX_PROJECT_MEMORY_DB || DEFAULT_DB), 'locks', 'workspace-state.lock');
}

function withWorkspaceLock(callback) {
  const dir = lockDir();
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  const deadline = Date.now() + 5000;
  while (true) {
    try {
      fs.mkdirSync(dir);
      break;
    } catch (error) {
      if (error.code !== 'EEXIST' || Date.now() > deadline) {
        throw new Error(`could not acquire workspace state lock: ${dir}`);
      }
      sleepMs(100);
    }
  }
  try {
    return callback();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function detectNode(root) {
  const packageJsonPath = path.join(root, 'package.json');
  if (!fs.existsSync(packageJsonPath)) return null;
  const pkg = readJson(packageJsonPath) || {};
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const depNames = Object.keys(deps);
  const frameworkRules = [
    ['next', 'Next.js'],
    ['react', 'React'],
    ['vite', 'Vite'],
    ['vue', 'Vue'],
    ['nuxt', 'Nuxt'],
    ['svelte', 'Svelte'],
    ['@sveltejs/kit', 'SvelteKit'],
    ['electron', 'Electron'],
    ['express', 'Express'],
    ['fastify', 'Fastify'],
    ['remix', 'Remix'],
  ];
  let packageManager = 'npm';
  if (fileExists(root, 'pnpm-lock.yaml')) packageManager = 'pnpm';
  else if (fileExists(root, 'yarn.lock')) packageManager = 'yarn';
  else if (fileExists(root, 'bun.lockb') || fileExists(root, 'bun.lock')) packageManager = 'bun';

  const scripts = pkg.scripts || {};
  const runPrefix = packageManager === 'yarn' ? 'yarn' : `${packageManager} run`;
  const commands = {};
  for (const key of ['dev', 'test', 'build', 'lint', 'format', 'start']) {
    if (scripts[key]) commands[key] = key === 'start' && packageManager === 'npm' ? 'npm start' : `${runPrefix} ${key}`;
  }
  if (!commands.test && scripts['test:unit']) commands.test = `${runPrefix} test:unit`;
  if (!commands.dev && scripts.serve) commands.dev = `${runPrefix} serve`;

  return {
    language: 'JavaScript/TypeScript',
    packageManager,
    frameworks: frameworkRules.filter(([name]) => depNames.includes(name)).map(([, label]) => label),
    commands,
    manifests: ['package.json'],
  };
}

function detectPython(root) {
  const manifests = ['pyproject.toml', 'requirements.txt', 'setup.py'].filter((name) => fileExists(root, name));
  if (manifests.length === 0) return null;
  let packageManager = 'pip';
  if (fileExists(root, 'uv.lock')) packageManager = 'uv';
  else if (fileExists(root, 'poetry.lock')) packageManager = 'poetry';
  else if (fileExists(root, 'Pipfile')) packageManager = 'pipenv';

  const pyproject = fileExists(root, 'pyproject.toml')
    ? fs.readFileSync(path.join(root, 'pyproject.toml'), 'utf8')
    : '';
  const requirements = fileExists(root, 'requirements.txt')
    ? fs.readFileSync(path.join(root, 'requirements.txt'), 'utf8')
    : '';
  const combined = `${pyproject}\n${requirements}`.toLowerCase();
  const frameworks = [];
  if (combined.includes('django')) frameworks.push('Django');
  if (combined.includes('fastapi')) frameworks.push('FastAPI');
  if (combined.includes('flask')) frameworks.push('Flask');
  if (combined.includes('pytest')) frameworks.push('pytest');

  const runner = packageManager === 'uv' ? 'uv run ' : packageManager === 'poetry' ? 'poetry run ' : '';
  const commands = {};
  if (combined.includes('pytest') || fileExists(root, 'tests')) commands.test = `${runner}pytest`.trim();
  else if (fileExists(root, 'manage.py')) commands.test = `${runner}python manage.py test`.trim();
  commands.lint = packageManager === 'uv' ? 'uv run ruff check .' : 'ruff check .';
  if (fileExists(root, 'manage.py')) commands.dev = `${runner}python manage.py runserver`.trim();

  return {
    language: 'Python',
    packageManager,
    frameworks,
    commands,
    manifests,
  };
}

function detectRust(root) {
  if (!fileExists(root, 'Cargo.toml')) return null;
  return {
    language: 'Rust',
    packageManager: 'cargo',
    frameworks: [],
    commands: { test: 'cargo test', build: 'cargo build', lint: 'cargo clippy', format: 'cargo fmt' },
    manifests: ['Cargo.toml'],
  };
}

function detectGo(root) {
  if (!fileExists(root, 'go.mod')) return null;
  return {
    language: 'Go',
    packageManager: 'go',
    frameworks: [],
    commands: { test: 'go test ./...', build: 'go build ./...', format: 'gofmt -w .' },
    manifests: ['go.mod'],
  };
}

function detectMakefile(root) {
  const makefile = ['Makefile', 'makefile', 'GNUmakefile'].find((name) => fileExists(root, name));
  if (!makefile) return null;
  let content = '';
  try {
    content = fs.readFileSync(path.join(root, makefile), 'utf8');
  } catch {
    content = '';
  }
  const hasTarget = (name) => new RegExp(`(^|\\n)${name}:`).test(content);
  const commands = {};
  for (const name of ['dev', 'test', 'build', 'lint', 'format', 'start', 'install']) {
    if (hasTarget(name)) commands[name] = `make ${name}`;
  }
  return {
    language: '',
    packageManager: 'make',
    frameworks: [],
    commands,
    manifests: [makefile],
  };
}

function detectGenericIntegration(root) {
  const scriptsDir = path.join(root, 'scripts');
  const shellScripts = fs.existsSync(scriptsDir)
    ? fs.readdirSync(scriptsDir).filter((name) => name.endsWith('.sh'))
    : [];
  const manifests = [];
  if (fileExists(root, 'README.md')) manifests.push('README.md');
  if (fileExists(root, 'LICENSE')) manifests.push('LICENSE');
  if (fileExists(root, 'NOTICE')) manifests.push('NOTICE');
  if (fs.existsSync(scriptsDir)) manifests.push('scripts/');
  if (fileExists(root, 'docs')) manifests.push('docs/');
  if (manifests.length === 0 && shellScripts.length === 0) return null;

  const commands = {};
  const knownScripts = [
    ['doctor.sh', 'doctor'],
    ['verify-project-memory.sh', 'verify'],
    ['run-upstream-app.sh', 'run'],
    ['install-desktop-app.sh', 'install'],
    ['build-upstream-app.sh', 'build'],
    ['bootstrap-upstream.sh', 'bootstrap'],
  ];
  for (const [scriptName, commandName] of knownScripts) {
    if (shellScripts.includes(scriptName)) {
      commands[commandName] = `./scripts/${scriptName}`;
    }
  }

  return {
    language: shellScripts.length > 0 ? 'Shell/Docs' : 'Docs',
    packageManager: '',
    frameworks: fs.existsSync(path.join(root, 'upstream')) ? ['Linux desktop integration'] : [],
    commands,
    manifests,
  };
}

function detectProject(root) {
  const detectors = [detectNode, detectPython, detectRust, detectGo, detectMakefile, detectGenericIntegration];
  const hits = detectors.map((fn) => fn(root)).filter(Boolean);
  const primary = hits[0] || {
    language: '',
    packageManager: '',
    frameworks: [],
    commands: {},
    manifests: [],
  };
  const commands = Object.assign({}, ...hits.map((hit) => hit.commands));
  const readme = ['README.md', 'README', 'readme.md'].find((name) => fileExists(root, name));
  const summary = readme ? readFirstLines(path.join(root, readme)) : '';

  return {
    root,
    name: path.basename(root),
    detectedAt: new Date().toISOString(),
    gitBranch: run('git', ['-C', root, 'branch', '--show-current']) || '',
    gitOriginUrl: run('git', ['-C', root, 'config', '--get', 'remote.origin.url']) || '',
    gitSha: run('git', ['-C', root, 'rev-parse', '--short', 'HEAD']) || '',
    primaryLanguage: primary.language,
    packageManager: primary.packageManager,
    frameworks: unique(hits.flatMap((hit) => hit.frameworks)),
    manifests: unique(hits.flatMap((hit) => hit.manifests)),
    commands,
    summary,
  };
}

function readDesktopLocalePreference() {
  const settingsPath = process.env.CODEX_LINUX_SETTINGS_FILE ||
    path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'codex-desktop', 'settings.json');
  const settings = readJson(settingsPath);
  return settings && typeof settings.localeOverride === 'string' ? settings.localeOverride : 'auto';
}

function desktopControlBackendPreference() {
  const session = process.env.XDG_SESSION_TYPE || '';
  if (session.toLowerCase() === 'wayland') return 'wayland';
  if (process.env.DISPLAY) return 'x11';
  return 'auto';
}

function upsertProject(dbPath, project) {
  const now = new Date().toISOString();
  const sql = `
INSERT INTO projects (
  root, name, detected_at, updated_at, git_branch, git_origin_url, git_sha,
  primary_language, frameworks_json, package_manager, commands_json, manifests_json, summary
) VALUES (
  '${shellQuoteSql(project.root)}',
  '${shellQuoteSql(project.name)}',
  '${shellQuoteSql(project.detectedAt)}',
  '${shellQuoteSql(now)}',
  '${shellQuoteSql(project.gitBranch)}',
  '${shellQuoteSql(project.gitOriginUrl)}',
  '${shellQuoteSql(project.gitSha)}',
  '${shellQuoteSql(project.primaryLanguage)}',
  '${shellQuoteSql(JSON.stringify(project.frameworks))}',
  '${shellQuoteSql(project.packageManager)}',
  '${shellQuoteSql(JSON.stringify(project.commands))}',
  '${shellQuoteSql(JSON.stringify(project.manifests))}',
  '${shellQuoteSql(project.summary)}'
)
ON CONFLICT(root) DO UPDATE SET
  name = excluded.name,
  updated_at = excluded.updated_at,
  git_branch = excluded.git_branch,
  git_origin_url = excluded.git_origin_url,
  git_sha = excluded.git_sha,
  primary_language = excluded.primary_language,
  frameworks_json = excluded.frameworks_json,
  package_manager = excluded.package_manager,
  commands_json = excluded.commands_json,
  manifests_json = excluded.manifests_json,
  summary = excluded.summary;
`;
  runSqlExec(dbPath, sql);
}

function loadThreadsForProject(project) {
  const codexDb = process.env.CODEX_STATE_DB || CODEX_STATE_DB;
  if (!fs.existsSync(codexDb)) return [];
  const rows = runSql(codexDb, `
SELECT
  id AS thread_id,
  title,
  preview,
  first_user_message,
  cwd,
  git_branch,
  git_origin_url,
  git_sha,
  datetime(COALESCE(updated_at_ms, updated_at * 1000) / 1000, 'unixepoch') AS updated_at,
  archived
FROM threads
ORDER BY COALESCE(updated_at_ms, updated_at * 1000) DESC
LIMIT 200;
`);
  return rows
    .map((thread) => ({ ...thread, match_reason: matchThreadToProject(thread, project) }))
    .filter((thread) => thread.match_reason)
    .slice(0, 50);
}

function loadAllThreads() {
  const codexDb = process.env.CODEX_STATE_DB || CODEX_STATE_DB;
  if (!fs.existsSync(codexDb)) return [];
  return runSql(codexDb, `
SELECT
  id AS thread_id,
  title,
  preview,
  first_user_message,
  cwd,
  git_branch,
  git_origin_url,
  git_sha,
  datetime(COALESCE(created_at_ms, created_at * 1000) / 1000, 'unixepoch') AS created_at,
  datetime(COALESCE(updated_at_ms, updated_at * 1000) / 1000, 'unixepoch') AS updated_at,
  archived
FROM threads
ORDER BY COALESCE(updated_at_ms, updated_at * 1000) DESC;
`);
}

function syncThreads(dbPath, projectRoot) {
  const project = loadProject(dbPath, projectRoot) || detectProject(projectRoot);
  const threads = loadThreadsForProject(project);
  const deleteSql = `DELETE FROM project_threads WHERE project_root = '${shellQuoteSql(projectRoot)}';`;
  const inserts = threads.map((thread) => `
INSERT INTO project_threads (project_root, thread_id, title, preview, cwd, updated_at, match_reason, archived)
VALUES (
  '${shellQuoteSql(projectRoot)}',
  '${shellQuoteSql(thread.thread_id)}',
  '${shellQuoteSql(thread.title)}',
  '${shellQuoteSql(thread.preview)}',
  '${shellQuoteSql(thread.cwd)}',
  '${shellQuoteSql(thread.updated_at)}',
  '${shellQuoteSql(thread.match_reason)}',
  ${Number(thread.archived) || 0}
);`).join('\n');
  runSqlExec(dbPath, `${deleteSql}\n${inserts}`);
  return threads;
}

function loadSummaries(threads) {
  const memoryDb = process.env.CODEX_MEMORY_DB || CODEX_MEMORY_DB;
  if (!fs.existsSync(memoryDb) || threads.length === 0) return [];
  const ids = threads.map((thread) => sqlString(thread.thread_id)).join(', ');
  return runSql(memoryDb, `
SELECT
  thread_id,
  rollout_summary,
  raw_memory,
  datetime(generated_at, 'unixepoch') AS generated_at
FROM stage1_outputs
WHERE thread_id IN (${ids})
ORDER BY generated_at DESC;
`);
}

function syncSummaries(dbPath, projectRoot, threads) {
  const summaries = loadSummaries(threads);
  const deleteSql = `DELETE FROM thread_summaries WHERE project_root = ${sqlString(projectRoot)};`;
  const inserts = summaries.map((summary) => `
INSERT INTO thread_summaries (project_root, thread_id, rollout_summary, raw_memory, generated_at)
VALUES (
  ${sqlString(projectRoot)},
  ${sqlString(summary.thread_id)},
  ${sqlString(summary.rollout_summary)},
  ${sqlString(summary.raw_memory)},
  ${sqlString(summary.generated_at)}
);`).join('\n');
  runSqlExec(dbPath, `${deleteSql}\n${inserts}`);
  return summaries;
}

function globalStatePath() {
  return process.env.CODEX_GLOBAL_STATE || CODEX_GLOBAL_STATE;
}

function loadGlobalState() {
  const statePath = globalStatePath();
  if (!fs.existsSync(statePath)) {
    return { statePath, state: {} };
  }
  const raw = fs.readFileSync(statePath, 'utf8');
  return { statePath, state: raw.trim() ? JSON.parse(raw) : {} };
}

function backupGlobalState(statePath) {
  if (!fs.existsSync(statePath)) return null;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${statePath}.bak-${timestamp}`;
  fs.copyFileSync(statePath, backupPath);
  return backupPath;
}

function listWorkspaceRoots(state) {
  const saved = Array.isArray(state['electron-saved-workspace-roots'])
    ? state['electron-saved-workspace-roots']
    : [];
  const active = Array.isArray(state['active-workspace-roots'])
    ? state['active-workspace-roots']
    : [];
  return { saved, active };
}

function workspaceStatus(projectRoot) {
  const { statePath, state } = loadGlobalState();
  const { saved, active } = listWorkspaceRoots(state);
  return {
    statePath,
    saved,
    active,
    isSaved: saved.includes(projectRoot),
    isActive: active.includes(projectRoot),
  };
}

function rememberWorkspaceRegistration(dbPath, projectRoot, status) {
  const now = new Date().toISOString();
  runSqlExec(dbPath, `
INSERT INTO workspace_roots (project_root, registered_at, global_state_path, saved, active)
VALUES (${sqlString(projectRoot)}, ${sqlString(now)}, ${sqlString(status.statePath)}, ${status.isSaved ? 1 : 0}, ${status.isActive ? 1 : 0})
ON CONFLICT(project_root) DO UPDATE SET
  registered_at = excluded.registered_at,
  global_state_path = excluded.global_state_path,
  saved = excluded.saved,
  active = excluded.active;
`);
}

function registerWorkspaceRoot(dbPath, projectRoot) {
  return withWorkspaceLock(() => registerWorkspaceRootUnlocked(dbPath, projectRoot));
}

function registerWorkspaceRootUnlocked(dbPath, projectRoot, options = {}) {
  const backup = options.backup !== false;
  const { statePath, state } = loadGlobalState();
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const before = listWorkspaceRoots(state);
  const saved = unique([...before.saved, projectRoot]);
  const active = unique([...before.active, projectRoot]);
  const changed =
    saved.length !== before.saved.length ||
    active.length !== before.active.length ||
    !before.saved.includes(projectRoot) ||
    !before.active.includes(projectRoot);
  let backupPath = null;
  if (changed) {
    backupPath = backup ? backupGlobalState(statePath) : null;
    state['electron-saved-workspace-roots'] = saved;
    state['active-workspace-roots'] = active;
    fs.writeFileSync(statePath, `${compactJson(state)}\n`, 'utf8');
  }
  const status = workspaceStatus(projectRoot);
  rememberWorkspaceRegistration(dbPath, projectRoot, status);
  return { ...status, changed, backupPath };
}

function rememberedWorkspaceRoots(dbPath) {
  const rows = runSql(dbPath, `
SELECT root AS project_root FROM projects
UNION
SELECT project_root FROM workspace_roots
ORDER BY project_root;
`);
  return rows
    .map((row) => row.project_root)
    .filter((root) => root && fs.existsSync(root))
    .map((root) => fs.realpathSync(root));
}

function restoreWorkspaceRoots(dbPath, options = {}) {
  return withWorkspaceLock(() => restoreWorkspaceRootsUnlocked(dbPath, options));
}

function restoreWorkspaceRootsUnlocked(dbPath, options = {}) {
  const backup = options.backup !== false;
  const roots = unique(rememberedWorkspaceRoots(dbPath));
  if (roots.length === 0) return { changed: false, backupPath: null, results: [] };

  const { statePath, state } = loadGlobalState();
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const before = listWorkspaceRoots(state);
  const saved = unique([...before.saved, ...roots]);
  const active = unique([...before.active, ...roots]);
  const changed =
    saved.length !== before.saved.length ||
    active.length !== before.active.length ||
    roots.some((root) => !before.saved.includes(root) || !before.active.includes(root));

  let backupPath = null;
  if (changed) {
    backupPath = backup ? backupGlobalState(statePath) : null;
    state['electron-saved-workspace-roots'] = saved;
    state['active-workspace-roots'] = active;
    fs.writeFileSync(statePath, `${compactJson(state)}\n`, 'utf8');
  }

  const results = roots.map((root) => {
    const status = workspaceStatus(root);
    rememberWorkspaceRegistration(dbPath, root, status);
    return { root, ...status, changed };
  });

  return { changed, backupPath, results };
}

function parsePositiveNumber(value, fallback) {
  if (value === undefined) return fallback;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function parseWatchOptions(args) {
  let durationSeconds = 60;
  let intervalSeconds = 2;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--duration') {
      durationSeconds = parsePositiveNumber(args[index + 1], durationSeconds);
      index += 1;
    } else if (arg.startsWith('--duration=')) {
      durationSeconds = parsePositiveNumber(arg.slice('--duration='.length), durationSeconds);
    } else if (arg === '--interval') {
      intervalSeconds = parsePositiveNumber(args[index + 1], intervalSeconds);
      index += 1;
    } else if (arg.startsWith('--interval=')) {
      intervalSeconds = parsePositiveNumber(arg.slice('--interval='.length), intervalSeconds);
    }
  }
  return { durationSeconds, intervalSeconds };
}

function watchWorkspaceRoots(dbPath, options = {}) {
  const durationSeconds = options.durationSeconds || 60;
  const intervalSeconds = options.intervalSeconds || 2;
  const deadline = Date.now() + durationSeconds * 1000;
  let iterations = 0;
  let changes = 0;
  let lastRestore = null;

  while (Date.now() <= deadline) {
    const restore = restoreWorkspaceRoots(dbPath, { backup: iterations === 0 });
    iterations += 1;
    if (restore.changed) changes += 1;
    lastRestore = restore;
    if (Date.now() + intervalSeconds * 1000 > deadline) break;
    sleepMs(intervalSeconds * 1000);
  }

  return { iterations, changes, lastRestore };
}

function printWorkspaceStatus(status) {
  console.log(`Global state: ${status.statePath}`);
  console.log(`Saved:        ${status.isSaved ? 'yes' : 'no'}`);
  console.log(`Active:       ${status.isActive ? 'yes' : 'no'}`);
  console.log('Saved roots:');
  for (const root of status.saved) console.log(`  ${root}`);
  console.log('Active roots:');
  for (const root of status.active) console.log(`  ${root}`);
}

function printRestoreResults(restore) {
  if (restore.results.length === 0) {
    console.log('No remembered project roots to restore.');
    return;
  }
  for (const result of restore.results) {
    console.log(`${result.isSaved && result.isActive ? 'ok' : 'miss'} ${result.root}`);
  }
  console.log(`Changed: ${restore.changed ? 'yes' : 'no'}`);
  if (restore.backupPath) console.log(`Backup:  ${restore.backupPath}`);
}

function printWatchResults(result) {
  console.log(`Iterations: ${result.iterations}`);
  console.log(`Changes:    ${result.changes}`);
  if (result.lastRestore) {
    printRestoreResults(result.lastRestore);
  }
}

function snapshotDir() {
  return path.join(path.dirname(process.env.CODEX_PROJECT_MEMORY_DB || DEFAULT_DB), 'snapshots');
}

function backupDir() {
  return path.join(path.dirname(process.env.CODEX_PROJECT_MEMORY_DB || DEFAULT_DB), 'backups');
}

function persistenceDir() {
  return path.join(path.dirname(process.env.CODEX_PROJECT_MEMORY_DB || DEFAULT_DB), 'persistence');
}

function persistenceMarkerPath(projectRoot) {
  const safeName = path.basename(projectRoot).replace(/[^A-Za-z0-9_.-]/g, '_');
  return path.join(persistenceDir(), `${safeName}.json`);
}

function copyIfExists(sourcePath, targetDir, label) {
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    return { label, sourcePath, copied: false, reason: 'missing' };
  }
  const targetPath = path.join(targetDir, path.basename(sourcePath));
  if (sourcePath.endsWith('.sqlite')) {
    const result = childProcess.spawnSync('sqlite3', [sourcePath, `.backup ${targetPath}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (result.status !== 0) {
      throw new Error(result.stderr.trim() || `sqlite3 backup failed for ${sourcePath}`);
    }
  } else {
    fs.copyFileSync(sourcePath, targetPath);
  }
  return {
    label,
    sourcePath,
    targetPath,
    copied: true,
    size: fs.statSync(targetPath).size,
  };
}

function parseBackupOptions(args) {
  let keep = 20;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--keep') {
      keep = Math.max(1, Math.floor(parsePositiveNumber(args[index + 1], keep)));
      index += 1;
    } else if (arg.startsWith('--keep=')) {
      keep = Math.max(1, Math.floor(parsePositiveNumber(arg.slice('--keep='.length), keep)));
    }
  }
  return { keep };
}

function pruneBackups(keep) {
  const dir = backupDir();
  if (!fs.existsSync(dir)) return [];
  const protectedBackups = persistenceBackupPaths();
  const entries = fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(dir, entry.name))
    .sort()
    .reverse();
  const removable = entries.filter((entry) => !protectedBackups.has(entry));
  const removed = removable.slice(keep);
  for (const backupPath of removed) {
    fs.rmSync(backupPath, { recursive: true, force: true });
  }
  return removed;
}

function persistenceBackupPaths() {
  const dir = persistenceDir();
  if (!fs.existsSync(dir)) return new Set();
  const paths = new Set();
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    try {
      const marker = JSON.parse(fs.readFileSync(path.join(dir, entry.name), 'utf8'));
      if (marker.backupPath) paths.add(path.resolve(marker.backupPath));
    } catch {
      // Ignore unreadable marker files; doctor/persistence check will report them separately.
    }
  }
  return paths;
}

function writeBackup(dbPath, options = {}) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.join(backupDir(), timestamp);
  fs.mkdirSync(outDir, { recursive: true });

  const sources = [
    ['codex_threads', process.env.CODEX_STATE_DB || CODEX_STATE_DB],
    ['codex_memories', process.env.CODEX_MEMORY_DB || CODEX_MEMORY_DB],
    ['codex_global_state', globalStatePath()],
    ['project_memory', dbPath],
  ];
  const files = sources.map(([label, sourcePath]) => copyIfExists(sourcePath, outDir, label));
  const manifest = {
    generatedAt: new Date().toISOString(),
    backupDir: outDir,
    files,
  };
  const manifestPath = path.join(outDir, 'manifest.json');
  fs.writeFileSync(manifestPath, `${compactJson(manifest)}\n`, 'utf8');
  const removed = pruneBackups(options.keep || 20);
  return { outDir, manifestPath, files, removed };
}

function listBackups() {
  const dir = backupDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const backupPath = path.join(dir, entry.name);
      const manifestPath = path.join(backupPath, 'manifest.json');
      let generatedAt = entry.name;
      let fileCount = 0;
      if (fs.existsSync(manifestPath)) {
        try {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
          generatedAt = manifest.generatedAt || generatedAt;
          fileCount = (manifest.files || []).filter((file) => file.copied).length;
        } catch {
          fileCount = -1;
        }
      }
      return { backupPath, generatedAt, fileCount };
    })
    .sort((a, b) => b.backupPath.localeCompare(a.backupPath));
}

function latestBackupPath() {
  const backups = listBackups();
  return backups[0] ? backups[0].backupPath : null;
}

function sqliteCount(dbPath, tableName) {
  if (!fs.existsSync(dbPath)) return null;
  const result = childProcess.spawnSync('sqlite3', [dbPath, `select count(*) from ${tableName};`], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) return null;
  const count = Number(result.stdout.trim());
  return Number.isFinite(count) ? count : null;
}

function verifyBackup(backupPath) {
  const target = backupPath ? path.resolve(backupPath) : latestBackupPath();
  if (!target || !fs.existsSync(target)) {
    throw new Error('backup directory not found');
  }
  const manifestPath = path.join(target, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`backup manifest missing: ${manifestPath}`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const copied = new Map((manifest.files || []).filter((file) => file.copied).map((file) => [file.label, file]));
  const required = ['codex_threads', 'codex_global_state', 'project_memory'];
  const missing = required.filter((label) => !copied.has(label));
  if (missing.length > 0) {
    throw new Error(`backup missing required files: ${missing.join(', ')}`);
  }
  const threadsPath = copied.get('codex_threads').targetPath;
  const projectMemoryPath = copied.get('project_memory').targetPath;
  const globalStatePath = copied.get('codex_global_state').targetPath;
  const threadCount = sqliteCount(threadsPath, 'threads');
  const projectCount = sqliteCount(projectMemoryPath, 'projects');
  if (threadCount === null) throw new Error(`cannot read threads table from ${threadsPath}`);
  if (projectCount === null) throw new Error(`cannot read projects table from ${projectMemoryPath}`);
  JSON.parse(fs.readFileSync(globalStatePath, 'utf8'));
  return { backupPath: target, threadCount, projectCount, manifest };
}

function writeThreadSnapshot(dbPath, projectRoot) {
  const project = loadProject(dbPath, projectRoot) || detectProject(projectRoot);
  const allThreads = loadAllThreads();
  const projectThreads = allThreads
    .map((thread) => ({ ...thread, match_reason: matchThreadToProject(thread, project) }))
    .filter((thread) => thread.match_reason);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = snapshotDir();
  fs.mkdirSync(outDir, { recursive: true });
  const filePath = path.join(outDir, `${path.basename(projectRoot)}-${timestamp}.threads.json`);
  const snapshot = {
    generatedAt: new Date().toISOString(),
    projectRoot,
    projectName: project.name,
    codexStateDb: process.env.CODEX_STATE_DB || CODEX_STATE_DB,
    allThreadCount: allThreads.length,
    projectThreadCount: projectThreads.length,
    workspaceStatus: workspaceStatus(projectRoot),
    projectThreads,
    recentThreads: allThreads.slice(0, 50),
  };
  fs.writeFileSync(filePath, `${compactJson(snapshot)}\n`, 'utf8');
  return { filePath, snapshot };
}

function setPreference(dbPath, projectRoot, key, value) {
  const now = new Date().toISOString();
  runSqlExec(dbPath, `
INSERT INTO preferences (project_root, key, value, updated_at)
VALUES (${sqlString(projectRoot)}, ${sqlString(key)}, ${sqlString(value)}, ${sqlString(now)})
ON CONFLICT(project_root, key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at;
`);
}

function setPreferenceIfMissing(dbPath, projectRoot, key, value) {
  const existing = getPreference(dbPath, projectRoot, key);
  if (existing) return false;
  setPreference(dbPath, projectRoot, key, value);
  return true;
}

function getPreferences(dbPath, projectRoot) {
  return runSql(
    dbPath,
    `SELECT key, value, updated_at FROM preferences WHERE project_root = ${sqlString(projectRoot)} ORDER BY key;`,
  );
}

function getPreference(dbPath, projectRoot, key) {
  const rows = runSql(
    dbPath,
    `SELECT key, value, updated_at FROM preferences WHERE project_root = ${sqlString(projectRoot)} AND key = ${sqlString(key)} LIMIT 1;`,
  );
  return rows[0] || null;
}

function normalizeText(value) {
  return String(value || '').toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function projectKeywordAliases(project) {
  const raw = [
    project.name,
    project.name.replaceAll('-', ' '),
    project.gitOriginUrl ? path.basename(project.gitOriginUrl.replace(/\.git$/, '')) : '',
  ];
  if (project.name === 'linux-codex-desktop') {
    raw.push('linux codex desktop', 'linux codex 桌面', 'linux codex桌面', 'codex desktop linux', 'codex 桌面版', 'codex桌面版');
  }
  return unique(raw.map(normalizeText)).filter((value) => value.length >= 4);
}

function threadText(thread) {
  return normalizeText([
    thread.title,
    thread.preview,
    thread.first_user_message,
    thread.cwd,
  ].join(' '));
}

function matchThreadToProject(thread, project) {
  const projectRoot = project.root;
  const rootPrefix = projectRoot.endsWith(path.sep) ? projectRoot : `${projectRoot}${path.sep}`;
  if (thread.cwd === projectRoot || String(thread.cwd || '').startsWith(rootPrefix)) {
    return 'cwd';
  }
  if (project.gitOriginUrl && thread.git_origin_url && project.gitOriginUrl === thread.git_origin_url) {
    return 'git_origin';
  }
  const text = threadText(thread);
  const aliases = projectKeywordAliases(project);
  const alias = aliases.find((candidate) => text.includes(candidate));
  return alias ? `keyword:${alias}` : '';
}

function defaultPreferenceEntries(project) {
  const commands = project.commands || {};
  const entries = [
    ['language', readDesktopLocalePreference()],
    ['desktop.controlBackend', desktopControlBackendPreference()],
    ['codex.workspace.restore', 'enabled'],
    ['codex.workspace.watchOnLaunch', 'enabled'],
    ['codex.context.autoExport', 'enabled'],
  ];
  if (project.packageManager) entries.push(['project.packageManager', project.packageManager]);
  if (commands.test) entries.push(['project.command.test', commands.test]);
  if (commands.dev) entries.push(['project.command.dev', commands.dev]);
  else if (commands.run) entries.push(['project.command.dev', commands.run]);
  if (commands.build) entries.push(['project.command.build', commands.build]);
  if (commands.lint) entries.push(['project.command.lint', commands.lint]);
  return entries;
}

function initDefaultPreferences(dbPath, project) {
  const initialized = [];
  for (const [key, value] of defaultPreferenceEntries(project)) {
    if (value && setPreferenceIfMissing(dbPath, project.root, key, value)) {
      initialized.push({ key, value });
    }
  }
  return initialized;
}

function parseProject(row) {
  return {
    root: row.root,
    name: row.name,
    updatedAt: row.updated_at,
    gitBranch: row.git_branch,
    gitOriginUrl: row.git_origin_url,
    gitSha: row.git_sha,
    primaryLanguage: row.primary_language,
    packageManager: row.package_manager,
    frameworks: JSON.parse(row.frameworks_json || '[]'),
    commands: JSON.parse(row.commands_json || '{}'),
    manifests: JSON.parse(row.manifests_json || '[]'),
    summary: row.summary,
  };
}

function loadProject(dbPath, root) {
  const rows = runSql(dbPath, `SELECT * FROM projects WHERE root = ${sqlString(root)} LIMIT 1;`);
  return rows[0] ? parseProject(rows[0]) : null;
}

function printProject(project, threads = []) {
  if (!project) {
    console.log('No project memory found. Run: scripts/project-memory.js scan <project-root>');
    return;
  }
  console.log(`Project: ${project.name}`);
  console.log(`Root:    ${project.root}`);
  console.log(`Updated: ${project.updatedAt}`);
  if (project.gitBranch || project.gitSha) console.log(`Git:     ${project.gitBranch || '(no branch)'} ${project.gitSha}`.trimEnd());
  if (project.gitOriginUrl) console.log(`Remote:  ${project.gitOriginUrl}`);
  console.log(`Stack:   ${[project.primaryLanguage, ...project.frameworks].filter(Boolean).join(', ') || 'unknown'}`);
  console.log(`Package: ${project.packageManager || 'unknown'}`);
  console.log(`Files:   ${project.manifests.join(', ') || 'none'}`);
  if (Object.keys(project.commands).length > 0) {
    console.log('Commands:');
    for (const [name, command] of Object.entries(project.commands)) {
      console.log(`  ${name.padEnd(7)} ${command}`);
    }
  }
  console.log(`Threads: ${threads.length}`);
  for (const thread of threads.slice(0, 8)) {
    const reason = thread.match_reason ? ` [${thread.match_reason}]` : '';
    console.log(`  ${thread.updated_at || ''}${reason} ${thread.title || thread.thread_id}`);
  }
}

function printSummaries(summaries) {
  if (summaries.length === 0) {
    console.log('No generated Codex summaries found for this project yet.');
    return;
  }
  for (const summary of summaries) {
    console.log(`${summary.generated_at}  ${summary.thread_id}`);
    const text = summary.rollout_summary || summary.raw_memory || '';
    console.log(text.split(/\r?\n/).slice(0, 6).join('\n'));
    console.log('');
  }
}

function printPreferences(rows) {
  if (rows.length === 0) {
    console.log('No preferences stored for this project.');
    return;
  }
  for (const row of rows) {
    console.log(`${row.key}=${row.value}`);
  }
}

function printInitializedPreferences(rows) {
  if (rows.length === 0) {
    console.log('No new preferences initialized; existing project preferences were kept.');
    return;
  }
  for (const row of rows) {
    console.log(`Initialized preference: ${row.key}=${row.value}`);
  }
}

function listProjects(dbPath) {
  const rows = runSql(dbPath, 'SELECT root, name, updated_at, primary_language, package_manager FROM projects ORDER BY updated_at DESC;');
  if (rows.length === 0) {
    console.log('No project memories yet.');
    return;
  }
  for (const row of rows) {
    console.log(`${row.updated_at}  ${row.name}  ${row.primary_language || 'unknown'}  ${row.package_manager || 'unknown'}`);
    console.log(`  ${row.root}`);
  }
}

function refreshProject(dbPath, projectRoot) {
  const project = detectProject(projectRoot);
  upsertProject(dbPath, project);
  const preferences = initDefaultPreferences(dbPath, project);
  const threads = syncThreads(dbPath, projectRoot);
  const summaries = syncSummaries(dbPath, projectRoot, threads);
  const workspace = registerWorkspaceRoot(dbPath, projectRoot, { backup: false });
  return {
    project: loadProject(dbPath, projectRoot),
    preferences,
    threads,
    summaries,
    workspace,
  };
}

function refreshAllProjects(dbPath) {
  const roots = unique(rememberedWorkspaceRoots(dbPath));
  const results = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    results.push(refreshProject(dbPath, fs.realpathSync(root)));
  }
  const restore = restoreWorkspaceRoots(dbPath);
  return { results, restore };
}

function printRefreshResult(result) {
  console.log(`Project: ${result.project.name}`);
  console.log(`Root:    ${result.project.root}`);
  console.log(`Threads: ${result.threads.length}`);
  console.log(`Summaries: ${result.summaries.length}`);
  console.log(`New preferences: ${result.preferences.length}`);
  console.log(`Workspace: ${result.workspace.isSaved && result.workspace.isActive ? 'registered' : 'missing'}`);
}

function printRefreshAllResult(result) {
  if (result.results.length === 0) {
    console.log('No remembered projects to refresh.');
    return;
  }
  for (const item of result.results) {
    console.log(`${item.threads.length.toString().padStart(3)} thread(s)  ${item.project.root}`);
  }
  console.log(`Workspace changed: ${result.restore.changed ? 'yes' : 'no'}`);
}

function countProjectThreads(dbPath, projectRoot) {
  const rows = runSql(
    dbPath,
    `SELECT count(*) AS count FROM project_threads WHERE project_root = ${sqlString(projectRoot)};`,
  );
  return Number(rows[0]?.count) || 0;
}

function writePersistenceMarker(dbPath, projectRoot) {
  const refresh = refreshProject(dbPath, projectRoot);
  const backup = writeBackup(dbPath, { keep: 20 });
  const verified = verifyBackup(backup.outDir);
  const status = workspaceStatus(projectRoot);
  const marker = {
    generatedAt: new Date().toISOString(),
    projectRoot,
    projectName: refresh.project.name,
    gitSha: refresh.project.gitSha,
    gitBranch: refresh.project.gitBranch,
    threadCount: refresh.threads.length,
    summaryCount: refresh.summaries.length,
    workspaceSaved: status.isSaved,
    workspaceActive: status.isActive,
    backupPath: backup.outDir,
    backupThreadCount: verified.threadCount,
    backupProjectCount: verified.projectCount,
    codexStateDb: process.env.CODEX_STATE_DB || CODEX_STATE_DB,
    codexGlobalState: globalStatePath(),
    projectMemoryDb: dbPath,
  };
  fs.mkdirSync(persistenceDir(), { recursive: true });
  const filePath = persistenceMarkerPath(projectRoot);
  fs.writeFileSync(filePath, `${compactJson(marker)}\n`, 'utf8');
  return { filePath, marker };
}

function checkPersistenceMarker(dbPath, projectRoot) {
  const filePath = persistenceMarkerPath(projectRoot);
  if (!fs.existsSync(filePath)) {
    throw new Error(`persistence marker missing: ${filePath}`);
  }
  const marker = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const refresh = refreshProject(dbPath, projectRoot);
  const status = workspaceStatus(projectRoot);
  const backup = verifyBackup(marker.backupPath);
  const checks = [
    ['project memory exists', Boolean(refresh.project)],
    ['workspace saved root', status.isSaved],
    ['workspace active root', status.isActive],
    ['thread index retained', refresh.threads.length >= marker.threadCount],
    ['marked backup verifies', backup.threadCount >= marker.backupThreadCount && backup.projectCount >= marker.backupProjectCount],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  return {
    filePath,
    marker,
    current: {
      threadCount: refresh.threads.length,
      summaryCount: refresh.summaries.length,
      workspaceSaved: status.isSaved,
      workspaceActive: status.isActive,
      backupThreadCount: backup.threadCount,
      backupProjectCount: backup.projectCount,
    },
    checks,
    ok: failed.length === 0,
  };
}

function printPersistenceMark(result) {
  console.log(`Marker: ${result.filePath}`);
  console.log(`Project: ${result.marker.projectName}`);
  console.log(`Root:    ${result.marker.projectRoot}`);
  console.log(`Threads: ${result.marker.threadCount}`);
  console.log(`Workspace saved:  ${result.marker.workspaceSaved ? 'yes' : 'no'}`);
  console.log(`Workspace active: ${result.marker.workspaceActive ? 'yes' : 'no'}`);
  console.log(`Backup:  ${result.marker.backupPath}`);
}

function printPersistenceCheck(result) {
  console.log(`Marker: ${result.filePath}`);
  for (const [name, ok] of result.checks) {
    console.log(`${ok ? 'ok' : 'fail'} ${name}`);
  }
  console.log(`Marked threads: ${result.marker.threadCount}`);
  console.log(`Current threads: ${result.current.threadCount}`);
  console.log(`Workspace saved:  ${result.current.workspaceSaved ? 'yes' : 'no'}`);
  console.log(`Workspace active: ${result.current.workspaceActive ? 'yes' : 'no'}`);
  console.log(`Status: ${result.ok ? 'ok' : 'failed'}`);
  if (!result.ok) process.exitCode = 1;
}

function exportContext(project, threads, summaries = [], preferences = [], workspace = null) {
  const lines = [];
  lines.push(`# Project Context: ${project.name}`);
  lines.push('');
  lines.push(`- Root: ${project.root}`);
  if (project.gitBranch || project.gitSha) lines.push(`- Git: ${project.gitBranch || '(no branch)'} ${project.gitSha}`.trimEnd());
  if (project.gitOriginUrl) lines.push(`- Remote: ${project.gitOriginUrl}`);
  lines.push(`- Stack: ${[project.primaryLanguage, ...project.frameworks].filter(Boolean).join(', ') || 'unknown'}`);
  lines.push(`- Package manager: ${project.packageManager || 'unknown'}`);
  if (project.manifests.length) lines.push(`- Manifests: ${project.manifests.join(', ')}`);
  if (project.summary) lines.push(`- Summary: ${project.summary}`);
  if (Object.keys(project.commands).length > 0) {
    lines.push('');
    lines.push('## Commands');
    for (const [name, command] of Object.entries(project.commands)) {
      lines.push(`- ${name}: \`${command}\``);
    }
  }
  if (preferences.length > 0) {
    lines.push('');
    lines.push('## Local Preferences');
    for (const pref of preferences) {
      lines.push(`- ${pref.key}: ${pref.value}`);
    }
  }
  if (workspace) {
    lines.push('');
    lines.push('## Codex Workspace Persistence');
    lines.push(`- Global state: ${workspace.statePath}`);
    lines.push(`- Saved root: ${workspace.isSaved ? 'yes' : 'no'}`);
    lines.push(`- Active root: ${workspace.isActive ? 'yes' : 'no'}`);
  }
  if (threads.length > 0) {
    lines.push('');
    lines.push('## Recent Codex Threads');
    for (const thread of threads.slice(0, 20)) {
      const reason = thread.match_reason ? ` (${thread.match_reason})` : '';
      lines.push(`- ${thread.updated_at || ''}${reason}: ${thread.title || thread.thread_id}`);
    }
  }
  if (summaries.length > 0) {
    lines.push('');
    lines.push('## Available Thread Summaries');
    for (const summary of summaries.slice(0, 10)) {
      const text = (summary.rollout_summary || summary.raw_memory || '').replace(/\s+/g, ' ').trim();
      lines.push(`- ${summary.generated_at || ''}: ${text.slice(0, 240)}`);
    }
  }
  console.log(lines.join('\n'));
}

function main() {
  const command = process.argv[2];
  if (!command || command === '-h' || command === '--help') usage(command ? 0 : 1);
  const dbPath = process.env.CODEX_PROJECT_MEMORY_DB || DEFAULT_DB;
  ensureDb(dbPath);

  if (command === 'list') {
    listProjects(dbPath);
    return;
  }

  if (command === 'backup') {
    const action = process.argv[3];
    if (action === 'list') {
      const backups = listBackups();
      if (backups.length === 0) {
        console.log('No backups found.');
        return;
      }
      for (const backup of backups) {
        console.log(`${backup.generatedAt}  files=${backup.fileCount}  ${backup.backupPath}`);
      }
      return;
    }
    if (action === 'verify') {
      const result = verifyBackup(process.argv[4]);
      console.log(`Backup: ${result.backupPath}`);
      console.log(`Threads: ${result.threadCount}`);
      console.log(`Projects: ${result.projectCount}`);
      console.log('Status: ok');
      return;
    }
    const backup = writeBackup(dbPath, parseBackupOptions(process.argv.slice(3)));
    console.log(`Backup: ${backup.outDir}`);
    for (const file of backup.files) {
      console.log(`${file.copied ? 'ok' : 'skip'} ${file.label} ${file.targetPath || file.sourcePath || ''}`);
    }
    if (backup.removed.length > 0) {
      console.log(`Pruned: ${backup.removed.length}`);
    }
    return;
  }

  if (command === 'pref') {
    const action = process.argv[3];
    const root = realRoot(process.argv[4] || process.cwd());
    if (action === 'init') {
      let project = loadProject(dbPath, root);
      if (!project) {
        const detected = detectProject(root);
        upsertProject(dbPath, detected);
        project = loadProject(dbPath, root);
      }
      printInitializedPreferences(initDefaultPreferences(dbPath, project));
      return;
    }
    if (action === 'list') {
      printPreferences(getPreferences(dbPath, root));
      return;
    }
    if (action === 'get') {
      const key = process.argv[5];
      if (!key) usage(1);
      const pref = getPreference(dbPath, root, key);
      if (!pref) {
        console.log(`No preference found: ${key}`);
        process.exit(1);
      }
      console.log(pref.value);
      return;
    }
    if (action === 'set') {
      const key = process.argv[5];
      const value = process.argv.slice(6).join(' ');
      if (!key || value.length === 0) usage(1);
      setPreference(dbPath, root, key, value);
      console.log(`Stored preference: ${key}=${value}`);
      return;
    }
    usage(1);
  }

  if (command === 'workspace') {
    const action = process.argv[3];
    if (action === 'restore') {
      printRestoreResults(restoreWorkspaceRoots(dbPath));
      return;
    }
    if (action === 'watch') {
      printWatchResults(watchWorkspaceRoots(dbPath, parseWatchOptions(process.argv.slice(4))));
      return;
    }
    const root = realRoot(process.argv[4] || process.cwd());
    if (action === 'status') {
      printWorkspaceStatus(workspaceStatus(root));
      return;
    }
    if (action === 'register') {
      const status = registerWorkspaceRoot(dbPath, root);
      printWorkspaceStatus(status);
      console.log(`Changed:      ${status.changed ? 'yes' : 'no'}`);
      if (status.backupPath) console.log(`Backup:       ${status.backupPath}`);
      return;
    }
    usage(1);
  }

  if (command === 'refresh') {
    const target = process.argv[3];
    if (target === '--all') {
      printRefreshAllResult(refreshAllProjects(dbPath));
      return;
    }
    const root = realRoot(target || process.cwd());
    printRefreshResult(refreshProject(dbPath, root));
    console.log(`Memory DB: ${dbPath}`);
    return;
  }

  if (command === 'persistence') {
    const action = process.argv[3];
    const root = realRoot(process.argv[4] || process.cwd());
    if (action === 'mark') {
      printPersistenceMark(writePersistenceMarker(dbPath, root));
      return;
    }
    if (action === 'check') {
      printPersistenceCheck(checkPersistenceMarker(dbPath, root));
      return;
    }
    usage(1);
  }

  const root = realRoot(process.argv[3] || process.cwd());

  if (command === 'scan') {
    const result = refreshProject(dbPath, root);
    printProject(result.project, result.threads);
    printInitializedPreferences(result.preferences);
    console.log(`Memory DB: ${dbPath}`);
    return;
  }

  if (command === 'show') {
    const project = loadProject(dbPath, root);
    const threads = syncThreads(dbPath, root);
    syncSummaries(dbPath, root, threads);
    printProject(project, threads);
    console.log(`Memory DB: ${dbPath}`);
    return;
  }

  if (command === 'threads') {
    const threads = syncThreads(dbPath, root);
    if (threads.length === 0) {
      console.log('No Codex threads found for this project root.');
      return;
    }
    for (const thread of threads) {
      console.log(`${thread.updated_at}  ${thread.title || thread.thread_id}`);
      console.log(`  ${thread.cwd}`);
    }
    return;
  }

  if (command === 'summaries') {
    const threads = syncThreads(dbPath, root);
    const summaries = syncSummaries(dbPath, root, threads);
    printSummaries(summaries);
    return;
  }

  if (command === 'snapshot') {
    const { filePath, snapshot } = writeThreadSnapshot(dbPath, root);
    console.log(`Snapshot: ${filePath}`);
    console.log(`All Codex threads: ${snapshot.allThreadCount}`);
    console.log(`Project threads:   ${snapshot.projectThreadCount}`);
    console.log(`Workspace saved:   ${snapshot.workspaceStatus.isSaved ? 'yes' : 'no'}`);
    console.log(`Workspace active:  ${snapshot.workspaceStatus.isActive ? 'yes' : 'no'}`);
    return;
  }

  if (command === 'export-context') {
    let project = loadProject(dbPath, root);
    if (!project) {
      const detected = detectProject(root);
      upsertProject(dbPath, detected);
      project = loadProject(dbPath, root);
    }
    const threads = syncThreads(dbPath, root);
    const summaries = syncSummaries(dbPath, root, threads);
    initDefaultPreferences(dbPath, project);
    const preferences = getPreferences(dbPath, root);
    const workspace = workspaceStatus(root);
    exportContext(project, threads, summaries, preferences, workspace);
    return;
  }

  usage(1);
}

try {
  main();
} catch (error) {
  console.error(`error: ${error.message}`);
  process.exit(1);
}
