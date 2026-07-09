# Platform setup (admin, one time)

This is for **you**, the person setting up the platform — done **once**, not per app.
After this, your teammates just clone, vibecode, and run `npm run deploy`.

New to GCP? Don't worry. Follow the steps top to bottom. Total time ≈ 30–45 min.

---

## First, the mental model (how the whole thing works)

There are **two kinds of GitHub repos** — this trips people up, so read this once:

1. **The boilerplate repo** (ONE, made by you) — the template everyone starts from.
   You push `boilerplate-app/` to your org **once**. Teammates clone/download this.
2. **Each app's own repo** (MANY, made automatically) — when a teammate runs
   `npm run deploy`, the tool creates a brand-new repo named after their app and
   pushes their code there. **They never touch Git.** You don't make these.

And there are **two setups**:
- **Platform setup (this doc)** — you, once: GCP + MongoDB + GitHub + one script.
- **Per-laptop setup** — each teammate, once: `npm run setup` with a key you give them.

The flow end to end:
```
You (once):  set up GCP + Mongo + GitHub  →  push boilerplate-app to your org
Teammate:    clone boilerplate → npm run setup → npm run bootstrap → vibecode
             → npm run deploy → app is LIVE at https://their-app-xxxx.run.app
```

**Cost:** essentially free for demos. Cloud Run scales to zero (idle = ~$0),
Cloud Build has a free daily tier, MongoDB M0 is free. A handful of apps with
occasional deploys ≈ a dollar or two a month, often less.

---

## Part A — one-time platform setup

### Step 0 — Install the Google Cloud CLI and sign in
Install gcloud: <https://cloud.google.com/sdk/docs/install> (pick your OS, run the installer).
Then, in a terminal:
```bash
gcloud auth login
```
This opens a browser — sign in with the Google account that owns your GCP project.

### Step 1 — Your GCP project + billing
You said you have a fresh project. Get its **Project ID** (not the name — the ID,
e.g. `hypergro-vibe-apps`):
```bash
gcloud projects list
```
Then make sure **billing is enabled** on it (required, or Cloud Run/Build silently
fail): open <https://console.cloud.google.com/billing>, and link a billing account
to your project. (The free tier covers demo usage.)

Set it as your active project:
```bash
gcloud config set project YOUR_PROJECT_ID
```

### Step 2 — MongoDB Atlas (free database)
1. Go to <https://cloud.mongodb.com>, sign up, and **create a free M0 cluster**
   (pick a region near you, e.g. Mumbai for India).
2. **Database Access** → add a database user (username + password). Save the password.
3. **Network Access** → Add IP Address → **Allow access from anywhere (0.0.0.0/0)**.
   (Cloud Run's IPs change, so this is needed. Fine for non-production apps.)
4. **Connect** → **Drivers** → copy the connection string. It looks like:
   ```
   mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
   Replace `PASSWORD` with the real one. **Remove any `/dbname` before the `?`** —
   we want the base cluster URI (each app adds its own db name automatically).
   Keep this handy — it's your `MONGO_BASE_URI` for Step 4.

### Step 3 — GitHub org + a token
You need a token that can **create repos and push** in your org.
1. In your Hypergro GitHub org, use a bot/machine account (recommended) or your own.
2. Create a token:
   - **Classic** token (simplest): GitHub → Settings → Developer settings →
     Personal access tokens (classic) → Generate → check the **`repo`** scope.
     (To auto-create repos in the org, the account must be able to create repos there.)
   - Or a **fine-grained** token scoped to the org with **Contents: Read/write** and
     **Administration: Read/write**.
3. Copy the token. Note your **org name** (e.g. `hypergro`).

### Step 4 — Run the setup script (does the GCP heavy lifting)
Open [`scripts/admin-setup.sh`](scripts/admin-setup.sh), and at the top set:
```bash
PROJECT_ID="YOUR_PROJECT_ID"     # from Step 1
```
(Region defaults to `asia-south1` and names default sensibly — leave them unless you
have a reason.) Then run it:
```bash
bash scripts/admin-setup.sh
```
It will: enable the required APIs, create a storage bucket, create two service
accounts (one your apps **run as**, one that **deploys**), grant all the IAM,
**prompt you to paste the Mongo URI** from Step 2 (it stores it as a secret), and
finally generate a **`deploy-key.json`** file. Keep that file safe.

### Step 5 — Fill in `deploy.config.json`
Open [`deploy.config.json`](deploy.config.json) and replace the placeholders
(use the values the script printed at the end):
```json
{
  "name": "REPLACE_WITH_APP_NAME",   ← leave this; each app sets its own on first deploy
  "gcp": {
    "projectId": "YOUR_PROJECT_ID",
    "region": "asia-south1",
    "runtimeServiceAccount": "app-runtime@YOUR_PROJECT_ID.iam.gserviceaccount.com",
    ...
  },
  "gcsBucket": "YOUR_PROJECT_ID-uploads",
  "github": { "org": "YOUR_GITHUB_ORG", ... }
}
```

### Step 6 — Push the boilerplate to your org (this is "what to push on GitHub")
This publishes the **template** everyone clones. Secrets and `node_modules` are
already excluded by `.gitignore` (including `deploy-key.json`), so it's safe.

Create an empty repo in your org first (via github.com, e.g. `boilerplate-app`),
then from inside the `boilerplate-app/` folder:
```bash
git init -b main
git add .
git commit -m "Hypergro deploy boilerplate v1"
git remote add origin https://github.com/YOUR_ORG/boilerplate-app.git
git push -u origin main
```
✅ Done. **Do NOT push `deploy-key.json`** — it's gitignored, but double-check it's
not in the commit. You distribute that file to teammates separately (Slack/1Password/etc.).

---

> ### ⚠️ Don't run `npm run deploy` inside this template folder
> The first deploy writes the app's name into `deploy.config.json`. If you commit
> that, every teammate inherits the same name and they all collide on one Cloud Run
> service. To test, **copy the folder somewhere else** and deploy from the copy —
> which is exactly what a teammate does anyway:
> ```bash
> rsync -a --exclude node_modules --exclude .git ./ /tmp/vibe-test/
> cd /tmp/vibe-test && npm install && npm run bootstrap && npm run deploy
> ```
> In the committed template, keep `"name": "REPLACE_WITH_APP_NAME"`.

## Part B — what each teammate does (once per laptop, then per app)
Give them the repo link and the `deploy-key.json` file. **They do NOT need gcloud** —
only Node.js (and optionally Git). They:
```bash
# once per laptop
#   download the ZIP from the repo page (Code → Download ZIP), unzip, open the folder
npm install
npm run setup            # point it at the deploy-key.json you sent (it verifies the key)

# per app
npm run bootstrap        # creates the Next.js frontend
# ...vibecode with their AI tool...
npm run deploy           # → app is LIVE, URL printed + saved to docs/DEPLOYMENT.md
```
Tip: **downloading the ZIP** (instead of `git clone`) keeps each app's repo clean.

---

## Part C — what happens when they hit `npm run deploy`
1. Commits their code and **pushes to a new repo** `their-app` in your org (auto-created).
2. Uploads the code to **Cloud Build**, which builds the container from the `Dockerfile`
   (no Docker on their machine needed).
3. Deploys the image to **Cloud Run**, injecting the Mongo secret + config.
4. Grabs the **live URL** and writes it to `docs/DEPLOYMENT.md`.
Running `npm run deploy` again ships a new version to the same URL. `npm run rollback`
switches back to a previous version instantly.

---

## Troubleshooting
- **"Billing account not found" / build fails instantly** → billing isn't enabled (Step 1).
- **App loads but shows 403** → your org policy blocks public services; allow public
  Cloud Run, or set `"public": false` in `deploy.config.json` for private apps.
- **App is up but API calls fail** → check the Mongo URI secret and that Atlas network
  access is `0.0.0.0/0` (Step 2).
- **See what a live app is doing** → `npm run logs`.
