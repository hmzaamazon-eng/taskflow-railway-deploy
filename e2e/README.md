# TaskFlow E2E tests (Playwright)

Automated browser QA for the core TaskFlow app across four viewports
(**iPhone, iPad, laptop, desktop**). The suite boots the real app server
(`node server.js`), drives it like a user, and asserts behavior.

## Run it

```bash
npm install              # installs @playwright/test (already a devDependency)
npx playwright install chromium   # one-time: downloads the browser (~120 MB)
npm run test:e2e         # runs all specs on all 4 viewports
```

Other commands:

```bash
npm run test:e2e:ui      # interactive UI mode
npm run test:e2e:report  # open the HTML report from the last run
E2E_PORT=5000 npm run test:e2e   # use a different port if 4599 is busy
```

The config auto-starts `node server.js` (no `DATABASE_URL` needed — the app
falls back to its localStorage cache, which is exactly the save/refresh path the
tests verify). Screenshots are written to `e2e/screenshots/<viewport>.png`.

## What is covered

`e2e/viewports.spec.js` — runs on **all 4 viewports**:
- App loads with **no uncaught/JS console errors** (CDN/offline noise is filtered; real exceptions are not).
- **Screenshot** captured per viewport.
- **No horizontal scroll / layout overflow**.
- **Every core nav item switches views** (no dead nav), opening the mobile menu when needed.
- New Task modal opens/closes.

`e2e/core.spec.js` — full functional flows (run once on desktop):
- Add task → appears → **persists across refresh**.
- **Dashboard completion %** computed correctly (2 of 3 → 67%).
- **Restore**: confirmation required, replaces, **de-dups by id**, first copy not corrupted.
- **Restore cancel** keeps existing data untouched.
- Daily / Monthly / Analytics / Manage views render without errors.
- **CSV export** downloads a correctly-named file.
- **Clear-all** is confirmation-gated, then empties the list.

## Notes
- These were authored and statically validated in an environment where the
  Playwright browser binary could not be downloaded (network-restricted). Run the
  three commands above on your machine or CI to execute them for real.
- For CI, add a step running `npx playwright install --with-deps chromium`
  before `npm run test:e2e`.
