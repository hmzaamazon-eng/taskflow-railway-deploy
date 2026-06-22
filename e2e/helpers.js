// Shared helpers for TaskFlow E2E tests.
const { expect } = require("@playwright/test");

// Noise that only appears in restricted/offline runs (blocked CDNs) or when the
// app runs with no database (API 503). These are environmental, not app bugs, so
// they're filtered out of the "no console errors" assertion. Real uncaught
// exceptions (pageerror) are NEVER filtered.
const IGNORE = [
  /Failed to load resource/i,
  /net::ERR/i,
  /ERR_NETWORK|ERR_INTERNET|ERR_NAME/i,
  /cdnjs|fonts\.googleapis|fonts\.gstatic|cloudflare|chart/i,
  /storage_unavailable/i,
  /\b503\b/,
  /favicon/i,
];

// Attach collectors. Returns an array that fills with real errors only.
function watchErrors(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + (e && e.message)));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (!IGNORE.some((r) => r.test(t))) errors.push("console: " + t);
  });
  return errors;
}

// Wait until the app's JS has actually rendered the dashboard.
async function waitReady(page) {
  await page.waitForFunction(() => !!document.querySelector("#dashStats .stat"), null, { timeout: 15000 });
}

// Load the app with a clean localStorage (deterministic state per test).
async function gotoClean(page) {
  await page.goto("/");
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.reload();
  await waitReady(page);
}

// Navigate via the sidebar — opens the off-canvas menu first on mobile.
async function navTo(page, view) {
  const ham = page.locator("#hamburger");
  if (await ham.isVisible().catch(() => false)) {
    await ham.click();
    await expect(page.locator("#sidebar")).toHaveClass(/open/);
  }
  await page.locator(`#sidebar .nav-item[data-view="${view}"]`).click();
  await expect(page.locator(`#view-${view}`)).toHaveClass(/active/);
}

// Add a task through the modal exactly like a user would.
async function addTask(page, { title, status = "Pending", owner, category } = {}) {
  await page.click("#newTaskBtn");
  await expect(page.locator("#taskModal")).toHaveClass(/open/);
  await page.fill("#tTitle", title);
  if (owner) await page.selectOption("#tOwner", { label: owner });
  if (category) await page.selectOption("#tCategory", { label: category });
  await page.selectOption("#tStatus", { label: status });
  await page.click("#saveTask");
  await expect(page.locator("#taskModal")).not.toHaveClass(/open/);
}

module.exports = { watchErrors, waitReady, gotoClean, navTo, addTask };
