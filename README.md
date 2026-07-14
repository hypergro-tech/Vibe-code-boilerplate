# Vibe-Code Boilerplate — build with AI, ship in one command

This is your starting point for building an app with AI (Claude, Cursor, …). It
already has a production-grade backend, the wiring for a Next.js website, and — the
best part — a way to put your app **live on the internet by copy-pasting a few
commands**. You never touch Git, Docker, or servers.

```
vibe-code-boilerplate/
├── backend/     ← your API (Express + TypeScript). Production-ready already.
├── frontend/    ← your website (Next.js). Created for you on first run.
├── docs/        ← guides + your app's LIVE URL (saved here after you deploy)
├── .ai/         ← the rules your AI assistant follows, so your code stays clean
└── README.md    ← you are here
```

One app = one web address. The backend and website run together and share a single
URL, so there's nothing to juggle.

---

## 🔑 Before you start: get your deploy key

You need **one file** to be able to publish your app: **`deploy-key.json`**.

> **Where do I get it?** Ask the person who shared this project with you — your
> **tech lead / manager, or whoever set up this codebase**. They have the key and
> will send it to you directly (over chat/email, not committed to the project).

Keep that file private and don't commit it anywhere. That's the only thing you need
from someone else — everything below you can do yourself.

---

## ✅ One-time setup (once per computer)

1. **Install [Node.js](https://nodejs.org)** (v18 or newer). That's the only tool
   you must install. (Git is optional — it just lets deploys also save your code to
   GitHub.)

2. **From this project folder, run:**
   ```bash
   npm install
   npm run setup
   ```
   When it asks, **paste the path to your `deploy-key.json`**. It checks the key
   works and you're done. (It may also ask for an optional GitHub token — just press
   Enter to skip it; deploys work fine without it.)

That's the entire cloud setup. No Google Cloud account or CLI needed.

---

## 🏗️ Create your app's website (once per project)

```bash
npm run bootstrap
```

This builds a fresh Next.js website inside `frontend/` and connects it to the
backend automatically.

---

## 🤖 Now vibecode

Open the project in your AI coding tool and describe what you want to build. **Paste
the prompt below at the start of your session** so the AI follows the project's
standards and produces clean, deployable code.

<details open>
<summary><b>📋 Copy-paste this into your AI's prompt (once, at the start)</b></summary>

```text
You're building inside the Vibe-Code Boilerplate. FIRST, read CLAUDE.md,
.ai/master-prompt.md, and .ai/architecture.md, then follow those standards exactly —
don't invent your own patterns.

Key rules:
- Build only inside the existing layers. Backend: Route → Validator → Controller →
  Service → Repository → Model, wired through the DI container in backend/src/DI/.
  Frontend: Next.js in frontend/.
- Never add new top-level folders — new features nest inside the existing layers.
  Third-party integrations go in backend/src/Repository/external/.
- Data → MongoDB (via the Repository layer); files → GCS. Never write to local disk.
- Validate input with Zod, respond via sendSuccess, throw AppError subclasses.
- Read env only via backend/src/Config/AppConfig.ts — never hardcode secrets.
- Never edit the Dockerfile, server.js, frontend/next.config.mjs, ports, or scripts/.
- Never run git commands. To deploy, tell me to run `npm run deploy`.
```

</details>

**Test it on your machine anytime** (optional):
```bash
npm run dev
```
Then open <http://localhost:3000> — your website talks to your API automatically.

---

## 🚀 Put it LIVE

```bash
npm run deploy
```

This one command builds your app and publishes it to the internet. The first time
takes a few minutes; when it finishes, your **live web address is printed on screen
and saved to [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)**.

- **Ship an update?** Run `npm run deploy` again — same address, updated in a couple
  of minutes.
- **Broke something?** Run `npm run rollback` and pick a version that worked — it
  switches back instantly.
- **Curious what your live app is doing?** Run `npm run logs`.

---

## 🧭 The commands, at a glance

| Command | How often | What it does |
|---|---|---|
| `npm install` | once per project | installs the tools |
| `npm run setup` | **once per computer** | saves your deploy key (needs `deploy-key.json`) |
| `npm run bootstrap` | once per project | creates your app's website (frontend) |
| `npm run dev` | anytime | run + test on your own computer |
| `npm run deploy` | to go live / ship updates | publishes to the internet, prints your URL |
| `npm run rollback` | to undo | switch back to a previous version |
| `npm run logs` | to check | see what your live app is doing |

---

## Good to know

- **You never touch Git, Docker, or servers.** The commands above handle everything.
- **Your app's address, versions, and history** live in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).
- **Some files are off-limits** (the `Dockerfile`, `server.js`, ports, and the `/api`
  proxy). Your AI assistant already knows not to touch them — see [`.ai/deploy.md`](.ai/deploy.md).
- **Want a longer walkthrough?** Read [`docs/GETTING-STARTED.md`](docs/GETTING-STARTED.md).

<sub>Setting up this platform for a whole team for the first time (admins only)? See
[`PLATFORM-SETUP.md`](PLATFORM-SETUP.md).</sub>
