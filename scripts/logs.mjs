#!/usr/bin/env node
//
// Show what your live app is doing — no gcloud needed.
//   npm run logs
//
// Prints the most recent log lines from your Cloud Run app (oldest first).

import { Logging } from '@google-cloud/logging';
import { loadConfig, assertPlatformConfigured, ensureKey, gcpOptions, die, c } from './_lib.mjs';

const cfg = loadConfig();
assertPlatformConfigured(cfg);
ensureKey();

const name = cfg.name;
if (!name || /REPLACE_/.test(name)) die('This app has not been deployed yet. Run:  npm run deploy');

console.log(`\n${c.bold}Recent logs for "${name}"${c.reset} ${c.dim}(newest at the bottom)${c.reset}\n`);

const logging = new Logging(gcpOptions(cfg));
const filter = `resource.type="cloud_run_revision" AND resource.labels.service_name="${name}"`;

let entries;
try {
  [entries] = await logging.getEntries({ filter, pageSize: 60, orderBy: 'timestamp desc', autoPaginate: false });
} catch (e) {
  die(`Couldn't read logs: ${(e?.message || String(e)).split('\n')[0]}`);
}

if (!entries?.length) {
  console.log(`${c.dim}No logs yet. If you just deployed, wait a moment or open the app first.${c.reset}\n`);
  process.exit(0);
}

const color = (sev) =>
  sev === 'ERROR' || sev === 'CRITICAL' ? c.red : sev === 'WARNING' ? c.yellow : c.dim;

for (const e of entries.reverse()) {
  const ts = e.metadata?.timestamp ? new Date(e.metadata.timestamp).toISOString().replace('T', ' ').slice(0, 19) : '';
  const sev = e.metadata?.severity || 'DEFAULT';
  const msg = typeof e.data === 'string' ? e.data : e.data?.message || JSON.stringify(e.data);
  console.log(`${c.dim}${ts}${c.reset} ${color(sev)}${String(sev).padEnd(7)}${c.reset} ${msg}`);
}
console.log('');
