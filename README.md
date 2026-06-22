# TaskFlow — Daily Team To-Do & Work Tracker

A team productivity tracker (HTML + CSS + vanilla JS) with a small Node + Postgres
backend, so tasks are **saved on the server and shared across every device and
browser** — not trapped in one browser's local storage.

## Testing (browser E2E)

Automated Playwright tests run on **iPhone, iPad, laptop and desktop** viewports
(load/console-errors, layout overflow, navigation, add/save/refresh, restore +
de-dup, reports, CSV export, clear-all). They run automatically in CI on every
push (`.github/workflows/e2e.yml`).

Run them locally:

```bash
npm install && npx playwright install chromium && npm run test:e2e
```

- `npm run test:e2e:report` — open the HTML report from the last run
- `npm run test:e2e:ui` — interactive runner
- Screenshots are saved to `e2e/screenshots/<viewport>.png`. Full details: [`e2e/README.md`](e2e/README.md).

## Files
- `index.html` — the whole front-end app.
- `server.js` — Node server (Railway): serves `index.html` **and** a tiny REST
  API (`GET`/`PUT /api/tasks`) backed by Postgres.
- `api/tasks.js` — the same API as a **Vercel serverless function**.
- `vercel.json` — Vercel routing (serve `index.html`, send `/api/*` to the function).
- `package.json` — dependencies (`pg`) + `npm start` → `node server.js`.
- `railway.json` — start command + health check config.

## How saving works
- Tasks are stored in a Postgres `tasks` table (created automatically on boot).
- The browser keeps a **local cache** too, so the app loads instantly and keeps
  working offline; it syncs back to the server as soon as it can.
- The API reads `DATABASE_URL`. If it's missing, the app still runs but reports
  that changes won't be shared.

## Enable persistence on Railway (one-time)
1. In your Railway project: **New → Database → Add PostgreSQL**.
2. Railway automatically exposes `DATABASE_URL` to the app service. (If your
   app and DB are separate services, add a reference variable
   `DATABASE_URL = ${{Postgres.DATABASE_URL}}` on the app service.)
3. Redeploy. On boot the logs should show **"Postgres connected — task
   persistence is ON."** Done — data now saves and is shared by everyone.

## Enable persistence on Vercel (one-time)
Vercel runs the app as a **static file + serverless function** (not `server.js`).
The pieces are already in place (`api/tasks.js`, `vercel.json`).
1. Import the repo into Vercel (**Add New… → Project**). No build command needed.
2. In the project: **Storage → Create Database → Neon (Postgres)** → choose the
   *Vercel-Managed* option. Vercel injects `DATABASE_URL` (pooled) automatically.
3. **Redeploy** so the function picks up the variable. Saving now works and is
   shared by everyone with the link.

> **Vercel limitation:** serverless functions cap the request/response body at
> **~4.5 MB**. This app sends the whole task list (including base64 file
> attachments) in one request, so keep total data — especially attachments —
> under ~4.5 MB on Vercel. If you need lots of large attachments, **Railway**
> (which uses `server.js` with a 30 MB limit) is the better host.

---

## Deploy to Railway — Option A: CLI (fastest, no GitHub needed)

1. Install the Railway CLI (one time):
   - macOS: `brew install railway`
   - Windows/Linux/macOS (npm): `npm i -g @railway/cli`
2. Open a terminal **inside this folder** (the one containing `index.html`).
3. Log in: `railway login`
4. Create a project: `railway init` (pick "Empty Project", give it a name).
5. Deploy: `railway up`
6. Make it public: `railway domain`
   - This prints a public URL like `https://taskflow-production.up.railway.app`.
   - Open it — your app is live.

To redeploy after changes: just run `railway up` again.

---

## Deploy to Railway — Option B: GitHub (good for ongoing updates)

1. Create a new GitHub repo and upload these 4 files
   (`index.html`, `server.js`, `package.json`, `railway.json`).
2. In Railway: **New Project → Deploy from GitHub repo** → pick the repo.
3. Railway auto-detects Node, runs `npm start`, and deploys.
4. Open the service → **Settings → Networking → Generate Domain** to get a public URL.
5. Every push to the repo redeploys automatically.

---

## Notes
- Railway sets the `PORT` environment variable automatically; `server.js`
  reads it and binds to `0.0.0.0`. You don't need to configure anything.
- Tasks are shared by everyone with the link (no login). The in-app
  **Backup / Restore** still works for exporting/importing JSON snapshots.
- This now needs a Node host with a Postgres database (Railway, Render, Fly,
  etc.). Pure static hosts like GitHub Pages won't run the API, so saving
  wouldn't be shared there.
