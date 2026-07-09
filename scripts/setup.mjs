#!/usr/bin/env node
//
// One-time setup, per laptop. NO gcloud needed — just the shared deploy key your
// admin gave you. Stores it and verifies it actually works.
//
//   npm run setup
//   npm run setup -- /path/to/deploy-key.json     (non-interactive)

import fs from 'node:fs';
import { ServicesClient } from '@google-cloud/run';
import {
  CREDS_DIR, KEY_FILE, TOKEN_FILE, loadConfig, assertPlatformConfigured,
  gcpOptions, has, ask, log, ok, warn, info, die, c,
} from './_lib.mjs';

console.log(`\n${c.bold}Hypergro deploy — one-time setup${c.reset}\n`);

// Node version sanity (client libs need a modern Node).
const major = Number(process.versions.node.split('.')[0]);
if (major < 18) die(`Node ${process.versions.node} is too old — install Node 18 or newer from https://nodejs.org`);
ok(`Node ${process.versions.node}`);
if (!has('git')) warn('git is not installed — deploys still work, but code won\'t be saved to GitHub. (https://git-scm.com/downloads)');

// Config tells us which project/region to target.
const cfg = loadConfig();
assertPlatformConfigured(cfg);

// The shared deploy key (a Google service-account JSON your admin gave you).
fs.mkdirSync(CREDS_DIR, { recursive: true, mode: 0o700 });

let keyPath = process.argv[2];
if (!keyPath) {
  info('Your admin gave you a file named something like "deploy-key.json".');
  keyPath = await ask('Path to that deploy key file: ');
}
keyPath = keyPath.replace(/^["']|["']$/g, '').trim();
if (!keyPath || !fs.existsSync(keyPath)) die(`No file found at: ${keyPath || '(empty)'}`);

let key;
try {
  key = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
} catch {
  die('That file is not valid JSON — make sure it is the deploy key file you were given.');
}
if (key.type !== 'service_account' || !key.client_email) {
  die('That does not look like a Google service-account key (expected type "service_account").');
}
fs.writeFileSync(KEY_FILE, JSON.stringify(key), { mode: 0o600 });
ok(`Saved deploy key (${key.client_email})`);

// Verify the key actually works by making a real (read-only) API call.
log('Checking the key works…');
try {
  const client = new ServicesClient(gcpOptions(cfg));
  const parent = `projects/${cfg.gcp.projectId}/locations/${cfg.gcp.region}`;
  await client.listServices({ parent, pageSize: 1 }, { autoPaginate: false });
  ok(`Verified — the key can deploy to ${cfg.gcp.projectId} (${cfg.gcp.region})`);
} catch (e) {
  fs.rmSync(KEY_FILE, { force: true });
  die(
    'The key was rejected by Google Cloud:\n  ' +
      (e?.message || String(e)).split('\n')[0] +
      '\n  → Ask your admin to re-send the key, or confirm the platform setup ran (scripts/admin-setup.sh).'
  );
}

// The GitHub token (optional — enables commit + push on deploy).
const org = cfg.github?.org;
if (org && !/REPLACE_/.test(org)) {
  info(`\nOptional: a GitHub token lets deploys save your code to the "${org}" org automatically.`);
  info('(your typing is hidden)');
  const token = (await ask('Paste your GitHub token (or press Enter to skip): ', { silent: true })).trim();
  if (!token) {
    warn("Skipped GitHub — deploys will still work, they just won't save code to GitHub.");
  } else if ((token.match(/gh[pousr]_|github_pat_/g) || []).length > 1) {
    warn('That looks like the token was pasted twice. Skipping — re-run `npm run setup` and paste it once.');
  } else if (!/^gh[pousr]_[A-Za-z0-9]{36,}$/.test(token) && !/^github_pat_[A-Za-z0-9_]{20,}$/.test(token)) {
    warn("That doesn't look like a GitHub token (expected ghp_… or github_pat_…). Skipping.");
  } else {
    // Verify it actually works before saving.
    let login = '';
    try {
      const res = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      });
      if (!res.ok) throw new Error(`GitHub returned ${res.status}`);
      login = (await res.json()).login;
    } catch (e) {
      warn(`GitHub rejected the token (${e.message}). Skipping — deploys still work without it.`);
    }
    if (login) {
      fs.writeFileSync(TOKEN_FILE, token, { mode: 0o600 });
      ok(`Saved GitHub token (authenticated as ${login})`);
    }
  }
}

console.log(`\n${c.green}${c.bold}✓ Setup complete.${c.reset}  Next: ${c.bold}npm run bootstrap${c.reset} then ${c.bold}npm run deploy${c.reset}\n`);
