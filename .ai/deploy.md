# Deploy — what you must NEVER edit, and what's safe to change

The app is deployed automatically to Cloud Run in a fixed shape (one container,
one public port, backend proxied). A few files make that work. If you change them,
deploys break in ways non-technical users can't debug — so treat them as read-only.

## 🚫 NEVER edit these (platform-owned)
| File | Why it's locked |
|------|-----------------|
| `Dockerfile` | Builds both apps into the one container image, the exact right way. |
| `server.js` | Runs the backend (private) + frontend (public) and ties them together. |
| `frontend/next.config.mjs` | The `/api` proxy + `output: standalone`. This is what makes one URL work. |
| Port / HOST bindings | Backend must stay `127.0.0.1:5000`; frontend public on `$PORT`. |
| `.dockerignore`, `.gcloudignore`, `.gitignore` | Keep secrets and junk out of the image/repo. |
| `scripts/**`, `deploy.config.json` | The deploy/rollback tooling and its config. |

If you think one of these needs to change, stop and ask a human on the platform team.

## 🚫 NEVER run git commands
Do not run `git push`, `git remote`, `git commit`, or switch branches — not even if
the user says "push my code". This folder is often a clone of the **shared boilerplate
template**, so a push would overwrite the template for the whole team.

`npm run deploy` already does all of it safely: it commits, creates *this app's own*
GitHub repo, pushes there (never to the template), and then builds + deploys.
**If asked to push or deploy, run `npm run deploy`.**

## ✅ Safe to change (this is where you build)
- **`backend/src/**`** — add resources, business logic, validators, routes (under `/api`).
- **`frontend/` app code** — pages, components, styles, anything that calls `/api/*`.
- **Env values** in the deploy config / Secret Manager (never secrets in code).

## How it goes live (for context)
- `npm run deploy` → (optionally) commits + pushes to GitHub → builds the image in
  the cloud → deploys to Cloud Run → prints and saves the live URL.
- `npm run deploy` again ships a new version to the same URL.
- `npm run rollback` shifts traffic back to a previous version (instant, no rebuild).
- The live URL, current version, and commands live in `docs/DEPLOYMENT.md`
  (written automatically on first deploy).
