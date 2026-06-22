// Core functional flows. These exercise app logic (viewport-independent), so we
// run them once on the desktop project to keep the suite fast and deterministic.
const { test, expect } = require("@playwright/test");
const { watchErrors, gotoClean, navTo, addTask } = require("./helpers");

const STORE_KEY = "taskflow.tasks.v1";
const readSaved = (page) =>
  page.evaluate((k) => { try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch (e) { return []; } }, STORE_KEY);

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "core flows run once on desktop");
});

test("add task → appears → persists across refresh; no console errors", async ({ page }) => {
  const errors = watchErrors(page);
  await gotoClean(page);
  await addTask(page, { title: "Audit Task One", status: "Pending" });
  await navTo(page, "tasks");
  await expect(page.locator("#taskList")).toContainText("Audit Task One");

  // saved to storage
  expect((await readSaved(page)).some((t) => t.title === "Audit Task One")).toBeTruthy();

  // survives a full reload
  await page.reload();
  await navTo(page, "tasks");
  await expect(page.locator("#taskList")).toContainText("Audit Task One");
  expect(errors, errors.join("\n")).toEqual([]);
});

test("dashboard completion % is computed correctly from saved tasks", async ({ page }) => {
  await gotoClean(page);
  await addTask(page, { title: "Done A", status: "Completed" });
  await addTask(page, { title: "Done B", status: "Completed" });
  await addTask(page, { title: "Pending C", status: "Pending" });
  // 2 of 3 complete today → round(2/3*100) = 67%
  await expect(page.locator("#view-dashboard .stat.accent .value")).toHaveText("67%");
  const saved = await readSaved(page);
  expect(saved.length).toBe(3);
  expect(saved.filter((t) => t.status === "Completed").length).toBe(2);
});

test("restore: confirmation appears, replaces, de-dups by id, no corruption", async ({ page }) => {
  await gotoClean(page);
  await addTask(page, { title: "Existing Task" });

  const backup = { app: "TaskFlow", version: 1, tasks: [
    { id: "dup1", title: "Imported Alpha", owner: "Hamza", category: "Design", status: "Completed", date: "2026-06-20", hours: 1, minutes: 0, notes: "keep me" },
    { id: "dup1", title: "Imported Alpha DUPLICATE", owner: "Hamza", category: "Design", status: "Pending", date: "2026-06-20" },
    { id: "keep2", title: "Imported Beta", owner: "Abdallah", category: "Calls", status: "Pending", date: "2026-06-21" },
  ]};
  await page.setInputFiles("#restoreInput", { name: "backup.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)) });

  // confirmation required before any overwrite
  await expect(page.locator("#confirmModal")).toHaveClass(/open/);
  await expect(page.locator("#confirmTitle")).toHaveText("Replace all tasks?");
  await page.click("#confirmOk");
  await expect(page.locator("#confirmModal")).not.toHaveClass(/open/);

  const saved = await readSaved(page);
  expect(saved.length, "duplicate id collapsed + existing replaced").toBe(2);
  const ids = saved.map((t) => t.id);
  expect(new Set(ids).size, "no duplicate task ids").toBe(2);
  expect(ids).toContain("dup1");
  expect(ids).toContain("keep2");
  // first occurrence kept intact (not corrupted by the duplicate)
  expect(saved.find((t) => t.id === "dup1").title).toBe("Imported Alpha");
  expect(saved.find((t) => t.id === "dup1").status).toBe("Completed");

  await navTo(page, "tasks");
  await expect(page.locator("#taskList")).not.toContainText("Existing Task"); // replaced
  await expect(page.locator("#taskList")).toContainText("Imported Beta");
});

test("restore: cancel keeps existing data untouched", async ({ page }) => {
  await gotoClean(page);
  await addTask(page, { title: "Keep This Task" });
  const before = await readSaved(page);

  const backup = { app: "TaskFlow", tasks: [{ id: "x", title: "Should NOT import", owner: "Hamza", category: "Other", status: "Pending", date: "2026-06-20" }] };
  await page.setInputFiles("#restoreInput", { name: "b.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)) });
  await expect(page.locator("#confirmModal")).toHaveClass(/open/);
  await page.click("#confirmCancel");
  await expect(page.locator("#confirmModal")).not.toHaveClass(/open/);

  const after = await readSaved(page);
  expect(after.length).toBe(before.length);
  expect(after.some((t) => t.title === "Keep This Task")).toBeTruthy();
  expect(after.some((t) => t.title === "Should NOT import")).toBeFalsy();
});

test("daily, monthly, analytics & manage views render without errors", async ({ page }) => {
  const errors = watchErrors(page);
  await gotoClean(page);
  await addTask(page, { title: "Report Source", status: "Completed" });

  await navTo(page, "daily");
  await expect(page.locator("#view-daily.active")).toBeVisible();
  await expect(page.locator("#dailyDate")).toBeVisible();

  await navTo(page, "monthly");
  await expect(page.locator("#view-monthly.active")).toBeVisible();
  await expect(page.locator("#monthLabel")).toBeVisible();

  await navTo(page, "analytics");
  await expect(page.locator("#view-analytics.active")).toBeVisible();

  await navTo(page, "data");
  await expect(page.locator("#view-data.active")).toBeVisible();
  await expect(page.locator("#exportCsv")).toBeVisible();
  await expect(page.locator("#backupBtn")).toBeVisible();
  await expect(page.locator("#clearBtn")).toBeVisible();

  expect(errors, errors.join("\n")).toEqual([]);
});

test("CSV export downloads a correctly-named file from Manage", async ({ page }) => {
  await gotoClean(page);
  await addTask(page, { title: "Export Me" });
  await navTo(page, "data");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.click("#exportCsv"),
  ]);
  expect(download.suggestedFilename()).toMatch(/^taskflow-.*\.csv$/);
});

test("clear-all is confirmation-gated and then empties the list", async ({ page }) => {
  await gotoClean(page);
  await addTask(page, { title: "Temp Task" });
  await navTo(page, "data");
  await page.click("#clearBtn");
  await expect(page.locator("#confirmModal")).toHaveClass(/open/);
  await page.click("#confirmOk");
  await expect(page.locator("#confirmModal")).not.toHaveClass(/open/);
  expect((await readSaved(page)).length).toBe(0);
});
