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
  readKeyEmail, readGithubToken, has, sh, trySh, ask, slugify, isValidName,
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
    sh('git init -q');
    trySh(`git branch -M ${branch}`);
  }
  if (!(await createGithubRepo(gh.org, name, token))) return { skipped: 'could not create/find the GitHub repo' };
  // Point origin at THIS app's own repo (handles a boilerplate clone too).
  if (trySh('git remote get-url origin').ok) trySh(`git remote set-url origin ${repoUrl}`);
  else trySh(`git remote add origin ${repoUrl}`);

  sh('git add -A');
  trySh(`git commit -q -m "deploy: ${new Date().toISOString()}"`); // ok if nothing changed
  const basic = Buffer.from(`x-access-token:${token}`).toString('base64');
  const push = trySh(
    `git -c http.extraHeader="Authorization: Basic ${basic}" push -u origin HEAD:${branch}`,
    { env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }
  );
  if (!push.ok) return { skipped: `push failed (${push.out.split('\n').filter(Boolean).slice(-1)[0] || 'unknown'})` };
  return { pushed: repoUrl.replace(/\.git$/, '') };
}

log('Saving your code to GitHub…');
const git = await pushToGithub();
if (git.pushed) ok(`Pushed to ${git.pushed}`);
else warn(`Skipped GitHub: ${git.skipped}`);

// ---------------------------------------------------------------------------
// 3. Package the source (respect the same ignores as .gcloudignore)
// ---------------------------------------------------------------------------
const IGNORE_DIRS = new Set(['node_modules', '.next', 'dist', '.git', '.hypergro', 'frontend-scaffold']);
function includeInTar(p) {
  const parts = String(p).split(/[\\/]/).filter((s) => s && s !== '.');
  if (parts.some((seg) => IGNORE_DIRS.has(seg))) return false;
  const base = parts[parts.length - 1] || '';
  if (base === '.env' || (base.startsWith('.env.') && base !== '.env.example')) return false;
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

const cb = new CloudBuildClient(gcpOptions(cfg));
let result;
try {
  const [operation] = await cb.createBuild({ projectId, build });
  const logUrl = operation.metadata?.build?.logUrl;
  if (logUrl) info(`Watch it live: ${logUrl}`);
  [result] = await operation.promise();
} catch (e) {
  die(`Deploy failed: ${(e?.message || String(e)).split('\n')[0]}\n  → See the Cloud Build console for details.`);
}
if (result?.status !== 'SUCCESS') {
  die(`Build ended with status ${result?.status}. Open the Cloud Build logs to see why.`);
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
