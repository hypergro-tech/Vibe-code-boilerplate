// Shared helpers for the deploy tooling (setup / deploy / rollback / logs).
// Node ESM, cross-platform. Talks to Google Cloud through the official client
// libraries + a shared service-account KEY FILE — so end users need NO gcloud.

import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');
export const CONFIG_PATH = path.join(ROOT, 'deploy.config.json');

// Credentials live OUTSIDE the repo so they can never be committed.
export const CREDS_DIR = path.join(os.homedir(), '.hypergro');
export const KEY_FILE = path.join(CREDS_DIR, 'deploy-key.json');
export const TOKEN_FILE = path.join(CREDS_DIR, 'github-token');

// ----- pretty output -------------------------------------------------------
export const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', cyan: '\x1b[36m',
};
export const log = (m) => console.log(`${c.cyan}▸${c.reset} ${m}`);
export const ok = (m) => console.log(`${c.green}✓${c.reset} ${m}`);
export const warn = (m) => console.log(`${c.yellow}!${c.reset} ${m}`);
export const info = (m) => console.log(`${c.dim}${m}${c.reset}`);
export function die(m) {
  console.error(`\n${c.red}${c.bold}✗ ${m}${c.reset}\n`);
  process.exit(1);
}
export function banner(title, lines) {
  const width = Math.max(title.length, ...lines.map((l) => l.length)) + 4;
  const bar = '─'.repeat(width);
  console.log(`\n${c.green}┌${bar}┐${c.reset}`);
  console.log(`${c.green}│${c.reset} ${c.bold}${title.padEnd(width - 2)}${c.reset}${c.green}│${c.reset}`);
  for (const l of lines) console.log(`${c.green}│${c.reset} ${l.padEnd(width - 2)}${c.green}│${c.reset}`);
  console.log(`${c.green}└${bar}┘${c.reset}\n`);
}

// ----- shell (only used for optional git push) -----------------------------
export function has(cmd) {
  const probe = process.platform === 'win32' ? `where ${cmd}` : `command -v ${cmd}`;
  return spawnSync(probe, { shell: true, stdio: 'ignore' }).status === 0;
}
export function sh(cmd, opts = {}) {
  execSync(cmd, { cwd: ROOT, stdio: 'inherit', ...opts });
}
export function trySh(cmd, opts = {}) {
  try {
    const out = execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
    return { ok: true, out: (out || '').trim() };
  } catch (e) {
    return { ok: false, out: ((e.stdout || '') + (e.stderr || '')).toString().trim() };
  }
}

// ----- prompts -------------------------------------------------------------
export async function ask(question, { silent = false } = {}) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const answer = await new Promise((res) => {
    rl.question(question, res);
    // Mute echo AFTER the prompt is printed, so secrets never appear on screen.
    // (readline redraws `prompt + typed text` on every keystroke, so this must be
    // an unconditional no-op — matching on the prompt text would echo the secret.)
    if (silent) rl._writeToOutput = () => {};
  });
  rl.close();
  if (silent) console.log();
  return answer.trim();
}

// ----- config --------------------------------------------------------------
const PLACEHOLDER = /REPLACE_/;
export function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) die('deploy.config.json not found at the repo root.');
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {
    die(`deploy.config.json is not valid JSON: ${e.message}`);
  }
  // Convenience: once projectId is set, auto-fill the fields that embed it.
  const pid = cfg?.gcp?.projectId;
  if (pid && !PLACEHOLDER.test(pid)) {
    const sub = (s) => (typeof s === 'string' ? s.replace(/REPLACE_WITH_GCP_PROJECT_ID/g, pid) : s);
    if (cfg.gcp.runtimeServiceAccount) cfg.gcp.runtimeServiceAccount = sub(cfg.gcp.runtimeServiceAccount);
    if (cfg.gcp.sourcesBucket) cfg.gcp.sourcesBucket = sub(cfg.gcp.sourcesBucket);
    if (cfg.gcsBucket) cfg.gcsBucket = sub(cfg.gcsBucket);
  }
  // Defaults
  cfg.gcp = cfg.gcp || {};
  cfg.gcp.artifactRepo = cfg.gcp.artifactRepo || 'apps';
  cfg.gcp.sourcesBucket = cfg.gcp.sourcesBucket || (pid && !PLACEHOLDER.test(pid) ? `${pid}-deploy-sources` : '');
  cfg.gcp.resources = cfg.gcp.resources || { cpu: '1', memory: '512Mi', minInstances: 0, maxInstances: 3 };
  return cfg;
}
export function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + '\n');
}
export function assertPlatformConfigured(cfg) {
  const problems = [];
  if (!cfg?.gcp?.projectId || PLACEHOLDER.test(cfg.gcp.projectId)) problems.push('gcp.projectId');
  if (!cfg?.gcp?.region) problems.push('gcp.region');
  if (!cfg?.gcp?.runtimeServiceAccount || PLACEHOLDER.test(cfg.gcp.runtimeServiceAccount))
    problems.push('gcp.runtimeServiceAccount');
  if (!cfg?.gcp?.sourcesBucket || PLACEHOLDER.test(cfg.gcp.sourcesBucket)) problems.push('gcp.sourcesBucket');
  if (problems.length) {
    die(
      `deploy.config.json still has placeholders: ${problems.join(', ')}.\n` +
        `  A Hypergro admin fills these once (see scripts/admin-setup.sh), then commits the boilerplate.`
    );
  }
}

// ----- app name ------------------------------------------------------------
const SLUG_RE = /^[a-z]([-a-z0-9]*[a-z0-9])?$/; // valid Cloud Run + Mongo db + GitHub repo
export function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 49);
}
export function isValidName(name) {
  return typeof name === 'string' && SLUG_RE.test(name) && name.length <= 49;
}

// ----- credentials (the shared deploy key) ---------------------------------
export function keyExists() {
  return fs.existsSync(KEY_FILE);
}
export function ensureKey() {
  if (!keyExists()) {
    die('You are not set up to deploy yet. Run:  npm run setup\n  (You need the deploy-key.json file your admin gave you.)');
  }
}
export function readKeyEmail() {
  try {
    return JSON.parse(fs.readFileSync(KEY_FILE, 'utf8')).client_email || '';
  } catch {
    return '';
  }
}
/** Options object every @google-cloud/* client accepts: auth via the key file. */
export function gcpOptions(cfg) {
  return { projectId: cfg.gcp.projectId, keyFilename: KEY_FILE };
}
export function readGithubToken() {
  try {
    return fs.readFileSync(TOKEN_FILE, 'utf8').trim();
  } catch {
    return '';
  }
}
