# TaskFlow — Daily Team To-Do & Work Tracker

A single-file team productivity tracker (HTML + CSS + vanilla JS). All data is
stored in the browser's local storage. This folder wraps it in a tiny Node
server so it can be deployed on Railway (or any Node host).

## Files
- `index.html` — the whole app (this is the file you've been using).
- `server.js` — a zero-dependency static server that serves `index.html`.
- `package.json` — tells Railway to run `npm start` → `node server.js`.
- `railway.json` — start command + health check config.

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
- This is a static front-end app — there's no database. Each visitor's tasks
  live in their own browser. Use the in-app **Backup / Restore** to move data
  between devices or browsers.
- Prefer something even simpler for a static file? You can also drag this
  folder onto **Netlify Drop** (netlify.com/drop), or use **GitHub Pages** or
  **Vercel** — all free for static sites.
