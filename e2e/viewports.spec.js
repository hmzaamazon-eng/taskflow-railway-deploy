// Runs on every viewport (iphone / ipad / laptop / desktop).
const { test, expect } = require("@playwright/test");
const { watchErrors, waitReady, navTo } = require("./helpers");

test("loads cleanly + screenshot per viewport", async ({ page }, testInfo) => {
  const errors = watchErrors(page);
  await page.goto("/");
  await waitReady(page);
  await page.waitForTimeout(500); // let fonts/charts settle if reachable
  await page.screenshot({ path: `e2e/screenshots/${testInfo.project.name}.png`, fullPage: true });
  expect(errors, "uncaught/page errors:\n" + errors.join("\n")).toEqual([]);
});

test("no horizontal scroll (no layout overflow)", async ({ page }) => {
  await page.goto("/");
  await waitReady(page);
  const o = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }));
  expect(o.sw, "page must not overflow horizontally").toBeLessThanOrEqual(o.cw + 2);
});

test("primary navigation switches every core view (no dead nav)", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/");
  await waitReady(page);
  for (const v of ["tasks", "daily", "monthly", "analytics", "data", "dashboard"]) {
    await navTo(page, v);
  }
  expect(errors, errors.join("\n")).toEqual([]);
});

test("New Task button opens the modal on this viewport", async ({ page }) => {
  await page.goto("/");
  await waitReady(page);
  await page.click("#newTaskBtn");
  await expect(page.locator("#taskModal")).toHaveClass(/open/);
  await page.keyboard.press("Escape");
  await expect(page.locator("#taskModal")).not.toHaveClass(/open/);
});
