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
// Only the app's own stdout/stderr + request logs. Audit logs are excluded: they
// carry a binary protoPayload that would print as a wall of raw bytes.
const filter =
  `resource.type="cloud_run_revision" AND resource.labels.service_name="${name}" ` +
  `AND NOT logName:"cloudaudit.googleapis.com"`;

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

/** Pull a human-readable line out of an entry, or null if there isn't one. */
function messageOf(entry) {
  const d = entry.data;
  if (typeof d === 'string') return d.trimEnd();
  if (d && typeof d === 'object') {
    if (typeof d.message === 'string') return d.message.trimEnd();
    // Structured request logs: summarise instead of dumping JSON.
    const r = entry.metadata?.httpRequest;
    if (r?.requestMethod) return `${r.requestMethod} ${r.requestUrl || ''} ${r.status || ''}`.trim();
  }
  const r = entry.metadata?.httpRequest;
  if (r?.requestMethod) return `${r.requestMethod} ${r.requestUrl || ''} ${r.status || ''}`.trim();
  return null; // binary/structured payload with nothing readable — skip it
}

let shown = 0;
for (const e of entries.reverse()) {
  const msg = messageOf(e);
  if (!msg) continue;
  const ts = e.metadata?.timestamp ? new Date(e.metadata.timestamp).toISOString().replace('T', ' ').slice(0, 19) : '';
  const sev = e.metadata?.severity || 'DEFAULT';
  console.log(`${c.dim}${ts}${c.reset} ${color(sev)}${String(sev).padEnd(7)}${c.reset} ${msg}`);
  shown += 1;
}
if (!shown) console.log(`${c.dim}No app logs in the last while. Open your app's URL to generate some.${c.reset}`);
console.log('');
