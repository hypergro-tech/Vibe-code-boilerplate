#!/usr/bin/env node
//
// Make this app LIVE on Cloud Run — with NO gcloud installed locally.
// Run from the repo root:   npm run deploy
//
// How it works (all via the shared deploy key + Google's client libraries):
//   1) (best effort) commit your code and push it to your org's GitHub repo
//   2) package the code and upload it to Google Cloud Storage
//   3) Cloud Build builds the container AND deploys it to Cloud Run (gcloud runs
//      inside Google's build — never on your machine)
//   4) read the live URL and save it to docs/
//
// Running it again = ship a new version (same command, same URL).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { create as tarCreate } from 'tar';
import { Storage } from '@google-cloud/storage';
import { CloudBuildClient } from '@google-cloud/cloudbuild';
import { ServicesClient } from '@google-cloud/run';
import {
  ROOT, loadConfig, saveConfig, assertPlatformConfigured, ensureKey, gcpOptions,
  readKeyEmail, readGithubToken, has, git as gitCmd, ask, slugify, isValidName,
  log, ok, warn, info, die, banner,
} from './_lib.mjs';

const cfg = loadConfig();
assertPlatformConfigured(cfg);
ensureKey();

const { projectId, region, runtimeServiceAccount, artifactRepo, sourcesBucket, public: isPublic, resources } = cfg.gcp;

// ---------------------------------------------------------------------------
// 1. App name (prompt + persist on first deploy)
// ---------------------------------------------------------------------------
let name = cfg.name;
if (!isValidName(name)) {
  if (name && !/REPLACE_/.test(name)) warn(`"${name}" isn't a valid app name.`);
  info('Pick a name for this app — lowercase letters, numbers, hyphens (e.g. my-todo-app).');
  const suggested = slugify(path.basename(ROOT)) || '';
  const input = await ask(`App name${suggested ? ` [${suggested}]` : ''}: `);
  name = slugify(input || suggested);
  if (!isValidName(name)) die('That name is not valid. Use lowercase letters, numbers, and hyphens.');
  cfg.name = name;
  saveConfig(cfg);
  ok(`App name set to "${name}" (saved to deploy.config.json)`);
}

// ---------------------------------------------------------------------------
// 2. Push to GitHub (best effort — never blocks the deploy)
// ---------------------------------------------------------------------------

/** Normalise a git URL so https/ssh/.git variants of the same repo compare equal. */
function normaliseRepo(url) {
  return String(url || '')
    .trim()
    .replace(/^git@([^:]+):/, 'https://$1/') // git@github.com:org/x → https://github.com/org/x
    .replace(/\.git$/, '')
    .replace(/\/+$/, '')
    .toLowerCase();
}
const sameRepo = (a, b) => Boolean(a && b) && normaliseRepo(a) === normaliseRepo(b);

/** The repo `origin` currently points at, or '' if there's no origin/git. */
function currentOrigin() {
  const r = gitCmd(['remote', 'get-url', 'origin']);
  return r.ok ? r.out.trim() : '';
}

async function createGithubRepo(org, repo, token) {
  try {
    const res = await fetch(`https://api.github.com/orgs/${org}/repos`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ name: repo, private: true, auto_init: false }),
    });
    return res.ok || res.status === 422; // 422 = already exists
  } catch {
    return false;
  }
}
async function pushToGithub() {
  const gh = cfg.github || {};
  if (!gh.org || /REPLACE_/.test(gh.org) || gh.createRepo === false) return { skipped: 'GitHub not configured' };
  if (!has('git')) return { skipped: 'git is not installed' };
  const token = readGithubToken();
  if (!token) return { skipped: 'no GitHub token (run `npm run setup` to add one)' };
  const branch = gh.defaultBranch || 'main';
  const repoUrl = `https://github.com/${gh.org}/${name}.git`;

  if (!fs.existsSync(path.join(ROOT, '.git'))) {
    gitCmd(['init', '-q']);
    gitCmd(['branch', '-M', branch]);
  }
  if (!(await createGithubRepo(gh.org, name, token))) return { skipped: 'could not create/find the GitHub repo' };

  gitCmd(['add', '-A']);
  gitCmd(['commit', '-q', '-m', `deploy: ${new Date().toISOString()}`]); // ok if nothing changed
  const basic = Buffer.from(`x-access-token:${token}`).toString('base64');
  // Push straight to THIS app's own repo URL. We deliberately never touch `origin`,
  // so deploying from a clone of the boilerplate can't hijack its remote. Run via an
  // argv array (no shell) so the auth header is safe on Windows/macOS/Linux alike.
  const push = gitCmd(['push', repoUrl, `HEAD:${branch}`], {
    env: { GIT_TERMINAL_PROMPT: '0' },
    extraConfig: [`http.extraHeader=Authorization: Basic ${basic}`],
  });
  if (!push.ok) return { skipped: `push failed (${push.out.split('\n').filter(Boolean).slice(-1)[0] || 'unknown'})` };

  // This folder was cloned from the shared boilerplate, so `origin` still points at
  // the TEMPLATE. Now that the app has its own repo, repoint `origin` there — otherwise
  // a plain `git push` (which AI tools run unprompted) would overwrite the template
  // for everyone. We only ever touch `origin` when it is exactly the template.
  let repointed = false;
  if (gh.templateRepo && sameRepo(currentOrigin(), gh.templateRepo)) {
    repointed = gitCmd(['remote', 'set-url', 'origin', repoUrl]).ok;
  }
  return { pushed: repoUrl.replace(/\.git$/, ''), repointed };
}

log('Saving your code to GitHub…');
const git = await pushToGithub();
if (git.pushed) {
  ok(`Pushed to ${git.pushed}`);
  if (git.repointed) info(`  (this folder is now linked to your app's repo, not the shared boilerplate)`);
} else {
  warn(`Skipped GitHub: ${git.skipped}`);
  // No app repo yet, so `origin` may still point at the shared template.
  const tpl = cfg.github?.templateRepo;
  if (has('git') && tpl && sameRepo(currentOrigin(), tpl)) {
    warn('This folder is still linked to the shared boilerplate template.');
    warn("Do NOT run `git push` here — it would overwrite the template for everyone.");
    info('  Fix it with:  git remote remove origin');
  }
}

// ---------------------------------------------------------------------------
// 3. Package the source (respect the same ignores as .gcloudignore)
// ---------------------------------------------------------------------------
const IGNORE_DIRS = new Set(['node_modules', '.next', 'dist', '.git', '.hypergro', 'frontend-scaffold']);
function includeInTar(p) {
  const parts = String(p).split(/[\\/]/).filter((s) => s && s !== '.');
  if (parts.some((seg) => IGNORE_DIRS.has(seg))) return false;
  const base = parts[parts.length - 1] || '';
  if (base === '.env' || (base.startsWith('.env.') && base !== '.env.example')) return false;
  // NEVER upload credentials with the source.
  if (/deploy-key.*\.json$/i.test(base) || base.endsWith('.pem')) return false;
  if (base.endsWith('.log') || base === '.DS_Store') return false;
  return true;
}
if (!fs.existsSync(path.join(ROOT, 'frontend', 'package.json'))) {
  die('The frontend hasn\'t been created yet. Run:  npm run bootstrap');
}

const stamp = Date.now();
const tarPath = path.join(os.tmpdir(), `deploy-${name}-${stamp}.tgz`);
log('Packaging your code…');
const topLevel = fs.readdirSync(ROOT).filter((f) => includeInTar(f));
await tarCreate({ gzip: true, file: tarPath, cwd: ROOT, filter: includeInTar, portable: true }, topLevel);

// ---------------------------------------------------------------------------
// 4. Upload to Google Cloud Storage
// ---------------------------------------------------------------------------
const objectName = `deploy-sources/${name}/${stamp}.tgz`;
log('Uploading to Google Cloud…');
try {
  const storage = new Storage(gcpOptions(cfg));
  await storage.bucket(sourcesBucket).upload(tarPath, { destination: objectName, resumable: false });
} catch (e) {
  die(
    `Upload failed: ${(e?.message || String(e)).split('\n')[0]}\n` +
      `  → Confirm the bucket "gs://${sourcesBucket}" exists (created by scripts/admin-setup.sh).`
  );
} finally {
  fs.rmSync(tarPath, { force: true });
}

// ---------------------------------------------------------------------------
// 5. Cloud Build: build the image AND deploy to Cloud Run (gcloud runs in-cloud)
// ---------------------------------------------------------------------------
const envPairs = { ...(cfg.env || {}), APP_NAME: name };
if (cfg.dbPrefix) envPairs.DB_PREFIX = cfg.dbPrefix; // e.g. "vibecode-" → db "vibecode-<app>"
if (cfg.gcsBucket) {
  envPairs.GCS_BUCKET = cfg.gcsBucket;
  envPairs.GCS_PROJECT_ID = projectId;
}
const envArg = Object.entries(envPairs).map(([k, v]) => `${k}=${v}`).join(',');
const secretArg = Object.entries(cfg.secrets || {}).map(([k, v]) => `${k}=${v}`).join(',');
const image = `${region}-docker.pkg.dev/${projectId}/${artifactRepo}/${name}:${stamp}`;
const deployerEmail = readKeyEmail();

const build = {
  source: { storageSource: { bucket: sourcesBucket, object: objectName } },
  steps: [
    { name: 'gcr.io/cloud-builders/docker', args: ['build', '-t', image, '.'] },
    { name: 'gcr.io/cloud-builders/docker', args: ['push', image] },
    {
      name: 'gcr.io/google.com/cloudsdktool/cloud-sdk',
      entrypoint: 'gcloud',
      args: [
        'run', 'deploy', name,
        '--image', image,
        '--region', region,
        '--platform', 'managed',
        isPublic ? '--allow-unauthenticated' : '--no-allow-unauthenticated',
        '--service-account', runtimeServiceAccount,
        '--port', '8080',
        '--cpu', String(resources.cpu),
        '--memory', String(resources.memory),
        '--min-instances', String(resources.minInstances),
        '--max-instances', String(resources.maxInstances),
        '--set-env-vars', envArg,
        ...(secretArg ? ['--set-secrets', secretArg] : []),
        '--quiet',
      ],
    },
  ],
  images: [image],
  serviceAccount: `projects/${projectId}/serviceAccounts/${deployerEmail}`,
  options: { logging: 'CLOUD_LOGGING_ONLY' },
  timeout: { seconds: 1800 },
};

console.log('');
log(`Building & deploying "${name}" to Cloud Run (${region})…`);
info('The first build takes a few minutes (installing + building both apps). This is normal.');

// Cloud Build returns `status` as a protobuf enum, which the client may hand back
// as a NUMBER (3) or a STRING ('SUCCESS') depending on transport. Normalise both.
const BUILD_STATUS = {
  0: 'STATUS_UNKNOWN', 1: 'QUEUED', 2: 'WORKING', 3: 'SUCCESS', 4: 'FAILURE',
  5: 'INTERNAL_ERROR', 6: 'TIMEOUT', 7: 'CANCELLED', 9: 'EXPIRED', 10: 'PENDING',
};
const statusName = (s) => (typeof s === 'number' ? BUILD_STATUS[s] || `STATUS_${s}` : String(s ?? 'UNKNOWN'));

const cb = new CloudBuildClient(gcpOptions(cfg));
const TERMINAL = new Set(['SUCCESS', 'FAILURE', 'INTERNAL_ERROR', 'TIMEOUT', 'CANCELLED', 'EXPIRED']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Poll a build until it reaches a terminal state, tolerating transient API blips. */
async function pollBuild(id) {
  let blips = 0;
  for (;;) {
    try {
      const [b] = await cb.getBuild({ projectId, id });
      if (TERMINAL.has(statusName(b.status))) return b;
      blips = 0;
    } catch (e) {
      // Google's API hiccups (502/UNAVAILABLE) are common on long builds; only give
      // up after many consecutive failures.
      if (++blips > 30) throw e;
    }
    await sleep(5000);
  }
}

/** The REAL reason a build failed: the failing step + the tail of its log. */
async function explainBuildFailure(b, id) {
  const out = [];
  const failing = (b?.steps || []).find((s) => statusName(s.status) === 'FAILURE');
  if (failing) out.push(`Failed step: ${failing.id || failing.name}`);
  if (b?.failureInfo?.detail) out.push(b.failureInfo.detail);
  try {
    const { Logging } = await import('@google-cloud/logging');
    const logging = new Logging(gcpOptions(cfg));
    const [entries] = await logging.getEntries({
      filter: `resource.type="build" AND resource.labels.build_id="${id}"`,
      orderBy: 'timestamp desc',
      pageSize: 60,
      autoPaginate: false,
    });
    const tail = entries
      .map((e) => (typeof e.data === 'string' ? e.data : (e.data?.message ?? '')))
      .filter((l) => l && l.trim())
      .reverse()
      .map((l) => l.replace(/\s+$/, ''))
      .slice(-18);
    if (tail.length) out.push('', '─── last lines of the build log ───', ...tail);
  } catch {
    /* logs are best-effort — never mask the real failure with a logging error */
  }
  return out.join('\n  ');
}

let result;
let logUrl = '';
let buildId = '';
try {
  const [operation] = await cb.createBuild({ projectId, build });
  buildId = operation.metadata?.build?.id || '';
  logUrl = operation.metadata?.build?.logUrl || '';
  if (logUrl) info(`Watch it live: ${logUrl}`);
  [result] = await operation.promise();
} catch (e) {
  // Watching a long build can drop (e.g. "14 UNAVAILABLE: 502:Bad Gateway") while the
  // build itself keeps running fine. Never report that as a failed deploy — the build
  // was already submitted, so reconnect and poll it to its real outcome.
  if (!buildId) die(`Could not start the build: ${(e?.message || String(e)).split('\n')[0]}`);
  warn('Lost the connection while watching the build — reconnecting…');
  try {
    result = await pollBuild(buildId);
  } catch (e2) {
    die(
      `Lost contact with Cloud Build: ${(e2?.message || String(e2)).split('\n')[0]}\n` +
        `  Your build may still be running — check it here:\n  ${logUrl || buildId}`
    );
  }
}
const finalStatus = statusName(result?.status);
if (finalStatus !== 'SUCCESS') {
  const why = await explainBuildFailure(result, result?.id || buildId);
  die(`Build ended with status ${finalStatus}.\n  ${why}${logUrl ? `\n\n  Full logs: ${logUrl}` : ''}`);
}

// ---------------------------------------------------------------------------
// 6. Read the live URL + record it
// ---------------------------------------------------------------------------
const run = new ServicesClient(gcpOptions(cfg));
const [svc] = await run.getService({ name: `projects/${projectId}/locations/${region}/services/${name}` });
const url = svc.uri;
const revision = (svc.latestReadyRevision || '').split('/').pop();
const when = new Date().toISOString();

const docsDir = path.join(ROOT, 'docs');
fs.mkdirSync(docsDir, { recursive: true });
fs.writeFileSync(path.join(docsDir, 'live-url.txt'), `${url}\n`);
fs.writeFileSync(path.join(docsDir, 'DEPLOYMENT.md'), renderDeploymentDoc({ name, url, projectId, region, revision, when, git }));
ok('Saved the live URL to docs/DEPLOYMENT.md');

banner('🎉  Your app is LIVE', [
  url,
  '',
  'Ship an update:  npm run deploy',
  'Undo a change:   npm run rollback',
]);

function renderDeploymentDoc({ name, url, projectId, region, revision, when, git }) {
  const repoLine = git.pushed ? `- **GitHub:** ${git.pushed}\n` : '';
  return `# Deployment

## 🌐 Your app is live at
${url}

${repoLine}- **Service:** \`${name}\`
- **Region:** \`${region}\`
- **Project:** \`${projectId}\`
- **Current version (revision):** \`${revision}\`
- **Last deployed:** ${when}

> This file is updated automatically every time you deploy. Don't edit it by hand.

---

## Ship a new version
\`\`\`bash
npm run deploy
\`\`\`
Same command, same URL — a new version goes live in a couple of minutes.

## Undo a bad change (rollback)
\`\`\`bash
npm run rollback
\`\`\`
Pick a version from the list — traffic switches back instantly, no rebuild.

## See what your live app is doing (logs)
\`\`\`bash
npm run logs
\`\`\`
`;
}
