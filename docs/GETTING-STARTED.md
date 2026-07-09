# Getting started (no experience needed)

You're going to build an app by describing it to an AI, then put it on the internet
by copy-pasting a few commands. You don't need to know Git, Docker, or servers.

## Which command, how often

| Command | How often |
|---|---|
| `npm install` | once per project folder |
| **`npm run setup`** | **once per computer** (yes, on *your* computer too) |
| `npm run bootstrap` | once per project |
| `npm run dev` | anytime, to test locally |
| `npm run deploy` | every time you want it live |
| `npm run rollback` | to undo a bad change |

## 1. One-time setup on your computer
Install [Node.js](https://nodejs.org) (and optionally [Git](https://git-scm.com/downloads)
to save your code to GitHub). **No Google Cloud CLI needed.** Then, in this folder:
```bash
npm install
npm run setup      # paste the path to the "deploy-key.json" your admin gave you
```
It checks the key works, so you know right away you're good to go.

> This saves the key into your home folder (`~/.hypergro/`) — that's why later deploys
> never ask for it again. **Every person, on every computer, runs this once.**

## 2. Create your website
```bash
npm run bootstrap
```
This builds a fresh Next.js website inside `frontend/` and connects it to the API.
Run it once.

## 3. Build with AI
Open this project in your AI coding tool (Claude, Cursor, …) and describe what you
want, for example:

> "Add a Todo feature: a todo has a title and a done flag. Give me pages to add
> todos, list them, and mark them done."

The AI reads the rules in [`../.ai/`](../.ai/) and builds inside the correct
structure — a real API in `backend/` and pages in `frontend/` that talk to it.

### How to prompt well
- Describe **features and data** ("a product has a name, price, and photo"), not
  file names. The AI knows the structure.
- Ask it to **store files in GCS** and **data in MongoDB** if it forgets — never on
  local disk (the AI is told this, but a reminder helps).
- If something looks off, ask the AI to "follow `.ai/architecture.md`".

## 4. See it on your machine (optional)
```bash
npm run dev
```
Open <http://localhost:3000>. The website and API run together, just like they will
once it's live.

## 5. Go live
```bash
npm run deploy
```
A few minutes later you'll get a real web address (also saved to
[`DEPLOYMENT.md`](DEPLOYMENT.md)). Share it with anyone.

## 6. Update or undo
- **New version:** `npm run deploy` again (same address).
- **Undo a bad change:** `npm run rollback`, then pick a previous version.
- **See logs:** `npm run logs`.

That's the whole loop: **describe → deploy → share**, and **rollback** if needed.
