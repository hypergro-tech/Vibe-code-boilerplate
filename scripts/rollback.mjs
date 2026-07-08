#!/usr/bin/env node
//
// Go back to a previous version of your live app — no gcloud needed.
//   npm run rollback                 # pick from a list
//   npm run rollback -- --previous   # the version before the current one
//   npm run rollback -- --to <name>  # a specific revision name
//
// Rolling back just shifts traffic to a version Cloud Run already kept — instant,
// no rebuild.

import fs from 'node:fs';
import path from 'node:path';
import { ServicesClient, RevisionsClient } from '@google-cloud/run';
import {
  ROOT, loadConfig, assertPlatformConfigured, ensureKey, gcpOptions,
  ask, log, ok, die, banner, c,
} from './_lib.mjs';

const cfg = loadConfig();
assertPlatformConfigured(cfg);
ensureKey();

const name = cfg.name;
if (!name || /REPLACE_/.test(name)) die('This app has not been deployed yet. Run:  npm run deploy');
const { projectId, region } = cfg.gcp;
const serviceName = `projects/${projectId}/locations/${region}/services/${name}`;
const args = process.argv.slice(2);

function tsToDate(ts) {
  if (!ts) return null;
  const s = ts.seconds?.toNumber ? ts.seconds.toNumber() : Number(ts.seconds || 0);
  return new Date(s * 1000);
}
function rel(date) {
  if (!date) return '';
  const secs = Math.max(0, (Date.now() - date.getTime()) / 1000);
  for (const [label, s] of [['day', 86400], ['hour', 3600], ['minute', 60]]) {
    const n = Math.floor(secs / s);
    if (n >= 1) return `${n} ${label}${n > 1 ? 's' : ''} ago`;
  }
  return 'just now';
}
const shortRev = (full) => (full || '').split('/').pop();

const svcClient = new ServicesClient(gcpOptions(cfg));
const revClient = new RevisionsClient(gcpOptions(cfg));

// Current service + which revision serves traffic now.
let svc;
try {
  [svc] = await svcClient.getService({ name: serviceName });
} catch {
  die(`Couldn't find a deployed service named "${name}". Run:  npm run deploy`);
}
const t = (svc.traffic || []).find((x) => x.percent === 100) || (svc.traffic || [])[0];
const serving = t?.revision ? shortRev(t.revision) : shortRev(svc.latestReadyRevision);

// Recent revisions, newest first.
const [allRevs] = await revClient.listRevisions({ parent: serviceName });
const revs = allRevs
  .map((r) => ({ name: shortRev(r.name), date: tsToDate(r.createTime) }))
  .sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0))
  .slice(0, 10);

if (revs.length < 2) die('There is only one version so far — nothing to roll back to yet.');

// Resolve the target revision.
let target;
if (args.includes('--to')) {
  target = args[args.indexOf('--to') + 1];
  if (!revs.some((r) => r.name === target)) die(`No recent revision named "${target}".`);
} else if (args.includes('--previous')) {
  const i = revs.findIndex((r) => r.name === serving);
  target = revs[i + 1]?.name || revs[1]?.name;
} else {
  console.log(`\n${c.bold}Versions of "${name}" (newest first):${c.reset}\n`);
  revs.forEach((r, i) => {
    const live = r.name === serving ? `  ${c.green}← LIVE now${c.reset}` : '';
    console.log(`  ${c.bold}${i + 1}${c.reset}) ${r.name}  ${c.dim}${rel(r.date)}${c.reset}${live}`);
  });
  const pick = await ask('\nRoll back to which number? ');
  const idx = Number.parseInt(pick, 10) - 1;
  if (Number.isNaN(idx) || !revs[idx]) die('Not a valid choice.');
  target = revs[idx].name;
}

if (target === serving) die('That version is already live — nothing to do.');

log(`Switching traffic to ${target}…`);
// Read-modify-write the full service: only change traffic, preserve everything else.
svc.traffic = [{ type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION', revision: target, percent: 100 }];
try {
  const [op] = await svcClient.updateService({ service: svc });
  await op.promise();
} catch (e) {
  die(`Rollback failed: ${(e?.message || String(e)).split('\n')[0]}`);
}

// Best-effort: reflect the active revision in docs/DEPLOYMENT.md.
try {
  const doc = path.join(ROOT, 'docs', 'DEPLOYMENT.md');
  if (fs.existsSync(doc)) {
    const updated = fs
      .readFileSync(doc, 'utf8')
      .replace(/(\*\*Current version \(revision\):\*\* )`[^`]*`/, `$1\`${target}\` (rolled back)`);
    fs.writeFileSync(doc, updated);
  }
} catch { /* non-fatal */ }

banner('↩  Rolled back', [`Now serving: ${target}`, `URL (unchanged): ${svc.uri || ''}`]);
