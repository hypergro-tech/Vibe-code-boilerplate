#!/usr/bin/env node
//
// Generates the Next.js frontend into frontend/.
//
// We DON'T commit a Next.js app (Next/Tailwind/shadcn move fast and a committed
// app rots). Instead the frontend is generated fresh on first clone, then
// patched with the ONE thing that must never drift: the /api proxy that lets the
// browser reach the private Express backend with no CORS.
//
// Run once, from the repo root:   npm run bootstrap
// (Re-run with --force to regenerate from scratch.)

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FRONTEND = path.join(ROOT, 'frontend');
// Must NOT start with a dot — create-next-app uses the dir name as the npm
// package name, and npm names can't begin with a period.
const TMP = path.join(ROOT, 'frontend-scaffold');

const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', green: '\x1b[32m', yellow: '\x1b[33m',
  red: '\x1b[31m', cyan: '\x1b[36m', dim: '\x1b[2m',
};
const log = (m) => console.log(`${c.cyan}▸${c.reset} ${m}`);
const ok = (m) => console.log(`${c.green}✓${c.reset} ${m}`);
const warn = (m) => console.log(`${c.yellow}!${c.reset} ${m}`);
const die = (m) => { console.error(`${c.red}✗ ${m}${c.reset}`); process.exit(1); };
const run = (cmd, cwd = ROOT) => execSync(cmd, { cwd, stdio: 'inherit' });
const runSoft = (cmd, cwd = ROOT) => {
  try { execSync(cmd, { cwd, stdio: 'inherit' }); return true; }
  catch { return false; }
};

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

// The ONE critical config: the /api proxy + standalone output. This is what
// makes the frontend and backend share a single public port.
const NEXT_CONFIG = `import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Loopback port of the PRIVATE Express backend. Next resolves rewrites() at
// BUILD time and bakes the result into the routes-manifest, so this value is
// fixed at build — keep it equal to the container's BACKEND_PORT (5000).
const BACKEND_PORT = process.env.BACKEND_PORT || '5000';

const nextConfig = {
  // Minimal self-contained server build → small Docker image.
  output: 'standalone',

  // Pin the tracing root to THIS folder so the standalone output is always FLAT
  // (frontend/.next/standalone/server.js), regardless of any parent lockfile.
  outputFileTracingRoot: __dirname,

  // Let the backend own its own trailing slashes (so proxied routes that
  // redirect, like /api/docs, don't fight Next's own slash handling).
  skipTrailingSlashRedirect: true,

  async rewrites() {
    return [
      {
        // Same-origin proxy. The browser only ever calls /api/* on the public
        // port; Next forwards it to the private backend on loopback. No CORS.
        // The /api prefix is PRESERVED because Express mounts routes under /api.
        source: '/api/:path*',
        destination: \`http://127.0.0.1:\${BACKEND_PORT}/api/:path*\`,
      },
    ];
  },
};

export default nextConfig;
`;

const API_CLIENT = `import axios from 'axios';

// Same-origin API client. The browser calls /api/* and Next.js proxies every
// request to the private Express backend — so never use an absolute backend URL
// and never put secrets in frontend code.
export const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

export default api;
`;

const PROVIDERS = `'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

export default function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient());
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
`;

// Guardrails appended to the generated frontend/CLAUDE.md so any AI working inside
// frontend/ follows the platform rules (create-next-app ships its own CLAUDE.md).
const FRONTEND_RULES = `
## Hypergro platform rules (frontend)
This frontend is part of the Hypergro deploy boilerplate — follow the guardrails in \`../.ai/\`.
- Call the backend ONLY at same-origin \`/api/*\` using \`src/lib/api.ts\` (axios \`baseURL:'/api'\`). Never use an absolute backend URL; never put secrets in frontend code.
- Do NOT create Next.js API routes / route handlers (\`app/api/**\`) or server actions for data — all data lives in the Express backend under \`/api\`. See \`../.ai/architecture.md\`.
- Never edit \`next.config.mjs\` — its \`rewrites()\` proxy connects the frontend to the private backend. See \`../.ai/deploy.md\`.
- Data → MongoDB, files → GCS, via the backend. Never use the browser/localStorage as a database.
- NEVER run git commands (\`git push\`, \`git remote\`, \`git commit\`). This folder may be a clone of the shared boilerplate template, and a push would overwrite it for the whole team. To deploy, run \`npm run deploy\` from the repo root.
`;

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

const KEEP = new Set(['.gitkeep', 'README.md']);
const isEmpty = (dir) => !fs.existsSync(dir) || fs.readdirSync(dir).every((f) => KEEP.has(f));

console.log(`\n${c.bold}Bootstrapping the Next.js frontend${c.reset}\n`);

if (!isEmpty(FRONTEND) && !process.argv.includes('--force')) {
  die('frontend/ already has an app. Re-run with --force to regenerate it from scratch.');
}

// 1) Scaffold into a temp dir (create-next-app refuses a non-empty target), then move.
log('Creating the Next.js app (this pulls the latest version, ~1-2 min)…');
fs.rmSync(TMP, { recursive: true, force: true });
try {
  run(
    `npx --yes create-next-app@latest "${TMP}" ` +
      `--ts --tailwind --eslint --app --src-dir --import-alias "@/*" ` +
      `--use-npm --disable-git --yes`
  );
} catch {
  die('create-next-app failed. Check your internet connection and Node version (need Node 18+), then re-run.');
}
fs.rmSync(FRONTEND, { recursive: true, force: true });
fs.renameSync(TMP, FRONTEND);
fs.rmSync(path.join(FRONTEND, '.git'), { recursive: true, force: true }); // never a nested repo
ok('Next.js app created in frontend/');

// 2) Overwrite whatever next.config create-next-app scaffolded with OUR canonical
//    one. This is the non-negotiable step — the /api proxy lives here.
for (const f of ['next.config.js', 'next.config.mjs', 'next.config.ts']) {
  fs.rmSync(path.join(FRONTEND, f), { force: true });
}
fs.writeFileSync(path.join(FRONTEND, 'next.config.mjs'), NEXT_CONFIG);
ok('Installed the canonical next.config.mjs (/api → private backend proxy)');

// 3) Company-standard extras: React Query + axios (critical), shadcn/ui (best-effort).
log('Installing React Query + axios…');
run('npm install @tanstack/react-query axios', FRONTEND);

log('Setting up shadcn/ui…');
if (runSoft('npx --yes shadcn@latest init -d', FRONTEND)) {
  runSoft('npx --yes shadcn@latest add button card input', FRONTEND);
  ok('shadcn/ui ready');
} else {
  warn('shadcn/ui setup was skipped (version/network). Not fatal — add it later with `npx shadcn@latest init`.');
}

// 4) Preconfigured API client + React Query provider.
const libDir = path.join(FRONTEND, 'src', 'lib');
fs.mkdirSync(libDir, { recursive: true });
fs.writeFileSync(path.join(libDir, 'api.ts'), API_CLIENT);
fs.writeFileSync(path.join(FRONTEND, 'src', 'app', 'providers.tsx'), PROVIDERS);
ok('Added src/lib/api.ts and src/app/providers.tsx');

// 5) Best-effort: wrap the app in <Providers> so React Query works app-wide.
const layoutPath = path.join(FRONTEND, 'src', 'app', 'layout.tsx');
try {
  let src = fs.readFileSync(layoutPath, 'utf8');
  if (!src.includes('./providers')) {
    src = `import Providers from './providers';\n` + src;
    src = src.replace(/(\{children\})/, '<Providers>$1</Providers>');
    fs.writeFileSync(layoutPath, src);
    ok('Wrapped the app layout in <Providers>');
  }
} catch {
  warn('Could not auto-wire <Providers> into layout.tsx — wrap {children} in <Providers> yourself.');
}

// 6) Add our platform guardrails to frontend/CLAUDE.md (create-next-app ships its
//    own; we append so any AI working inside frontend/ follows the project rules).
const claudePath = path.join(FRONTEND, 'CLAUDE.md');
try {
  const existing = fs.existsSync(claudePath) ? fs.readFileSync(claudePath, 'utf8') : '';
  if (!existing.includes('Hypergro platform rules (frontend)')) {
    fs.writeFileSync(claudePath, (existing ? existing.trimEnd() + '\n' : '# CLAUDE.md\n') + FRONTEND_RULES);
    ok('Added platform guardrails to frontend/CLAUDE.md');
  }
} catch {
  warn('Could not update frontend/CLAUDE.md — not fatal.');
}

console.log(`\n${c.green}${c.bold}✓ Frontend ready.${c.reset}`);
console.log(`${c.dim}Next:${c.reset} run ${c.bold}npm run dev${c.reset} from the repo root, then open http://localhost:3000\n`);
