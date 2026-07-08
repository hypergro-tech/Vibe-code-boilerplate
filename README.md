# Boilerplate App — build with AI, ship in one command

This is the **Hypergro starting point** for any app you build with AI. It already
has a production-grade backend, the wiring for a Next.js frontend, and — most
importantly — a way to put your app **live on the internet by copy-pasting a few
commands**. No Git, no Docker, no servers to understand.

```
boilerplate-app/
├── backend/     ← your API (Express + TypeScript). Production-ready already.
├── frontend/    ← your website (Next.js). Created for you on first run.
├── docs/        ← guides + your app's LIVE URL (saved here after you deploy)
├── .ai/         ← the rules your AI assistant follows, so your code stays clean
└── README.md    ← you are here
```

One app = one website address. The backend and frontend run together in one place
and share a single URL, so there's nothing to juggle.

---

## ✅ First time on this computer (do once)

1. **Install the tools** (ask a teammate if unsure):
   - [Node.js](https://nodejs.org) (v18 or newer) — that's the only required one
   - [Git](https://git-scm.com/downloads) — optional, lets deploys save your code to GitHub
   - **No Google Cloud CLI needed** — the deploy talks to Google for you.

2. **Sign in for deploys.** Your admin gave you a file called `deploy-key.json`
   (and maybe a GitHub token). From this folder, run:
   ```bash
   npm install
   npm run setup
   ```
   Paste the path to your `deploy-key.json` when asked — it checks the key works
   and you're ready. That's the whole cloud setup.

---

## 🛠️ Build your app

1. **Create the frontend** (only needed once, right after you get the project):
   ```bash
   npm run bootstrap
   ```
   This builds a fresh Next.js website inside `frontend/` and wires it to the backend.

2. **Now vibecode.** Open the project in your AI coding tool (Claude, Cursor, …)
   and describe what you want. The AI reads the rules in `.ai/` and builds inside
   the right structure automatically — clean, production-grade code.

3. **Try it on your machine** (optional):
   ```bash
   npm run dev
   ```
   Open <http://localhost:3000>. Your website talks to your API automatically.

---

## 🚀 Put it LIVE

```bash
npm run deploy
```

That single command builds your app and publishes it to the internet. The first
time takes a few minutes. When it finishes, your **live web address is printed on
screen and saved to [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)**.

## 🔁 Ship a new version

Made changes and want them live? Run the **exact same command** again:

```bash
npm run deploy
```

Same address, updated in a couple of minutes.

## ↩️ Undo a bad change (rollback)

Something broke? Go back to a version that worked:

```bash
npm run rollback
```

Pick a version from the list — your site switches back instantly.

## 📜 See what your live app is doing

```bash
npm run logs
```

---

## Good to know

- **You never touch Git, Docker, or servers.** The commands above handle everything.
- **Your app's address, versions, and history** live in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).
- **Some files are off-limits** (the `Dockerfile`, `server.js`, ports, and the
  `/api` proxy). Your AI assistant knows not to touch them — see [`.ai/deploy.md`](.ai/deploy.md).
- **New here?** Read [`docs/GETTING-STARTED.md`](docs/GETTING-STARTED.md).

> Admins setting up the platform for the first time: see
> [`scripts/admin-setup.sh`](scripts/admin-setup.sh).
