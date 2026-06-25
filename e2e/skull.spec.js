// Skull section E2E — brand isolation, auto-save persistence, history filtering.
// Mirrors the user's QA checklist:
//   T1 Brand A: upload → analyze → save → in A history
//   T2 Brand B: different file → save → in B history
//   T3 A's data never appears under B (and vice-versa)
//   T4 history date filter (year/month/day) narrows correctly
//   T5 reload → saved reports persist (IndexedDB)
//   T6 Back after a report keeps data
//   T7 every saved item carries brandId + brandName + "Skull" tag
//
// NOTE: the app declares its state with `let`/`const`, which are NOT on
// `window` in a classic script — only top-level functions are. So evaluate()
// blocks reference those globals (skAll, skUI, calcData, _skLoaded, …) by BARE
// name, and seed brands via the app's own calcLoad() so the real binding updates.
const { test, expect } = require("@playwright/test");
const { watchErrors, waitReady } = require("./helpers");

const SKULL_DB = "taskflow_skull_v1";
const CALC_KEY = "taskflow.calculator.v1";

// Two brands with explicit IDs so we assert isolation by brandId, not name.
const BRANDS = { A: { id: "BR_HMZA", name: "HMZA" }, B: { id: "BR_ANAKZ", name: "ANAKZ" } };

const CSV_A = "Campaign,Search Term,Spend,Orders,7 Day Total Sales\nAuto-1,wireless charger,42.10,0,0\nAuto-1,charger pad,5.00,3,61.00\nExact-2,magsafe charger,18.00,2,55.00\n";
const CSV_B = "SKU,Product,Units,Sales,Cost\nBD-01,Yoga Mat,120,3600,1400\nBD-02,Resist Band,80,1600,520\n";

// Clean slate: wipe localStorage + the Skull IndexedDB, then seed two brands.
async function freshWithBrands(page) {
  await page.goto("/");
  await page.evaluate(async (db) => {
    try { localStorage.clear(); } catch (e) {}
    await new Promise((res) => { const r = indexedDB.deleteDatabase(db); r.onsuccess = r.onerror = r.onblocked = () => res(); });
  }, SKULL_DB);
  await page.reload();
  await waitReady(page);
  // Seed brands into the real store via the app's own load path, then force the
  // local analysis engine so the test never waits on the optional AI endpoint.
  await page.evaluate(({ brands, key }) => {
    const calc = { brands: [ { id: brands.A.id, name: brands.A.name, history: [] }, { id: brands.B.id, name: brands.B.name, history: [] } ], selectedBrandId: brands.A.id, hideNames: false };
    localStorage.setItem(key, JSON.stringify(calc));
    calcLoad(); _calcLoaded = true;                       // bare-name globals
    botAIStatus = { checked: true, configured: false, provider: null, model: null };
  }, { brands: BRANDS, key: CALC_KEY });
}

async function gotoSkull(page) {
  await page.locator('#sidebar .nav-item[data-view="skull"]').click();
  await expect(page.locator("#view-skull")).toHaveClass(/active/);
  await page.waitForFunction(() => _skLoaded === true);
}

// Drive a full upload→analyze→save for the currently-selected brand.
async function analyze(page, brandId, fileName, csv) {
  await page.evaluate((id) => skSelBrand(id), brandId);
  await page.setInputFiles("#skFileInput", { name: fileName, mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(page.locator("#view-skull")).toContainText("Ready to analyze");
  await page.click('#view-skull .btn-primary:has-text("Analyze")');
  await expect(page.locator("#view-skull")).toContainText("Recommendations", { timeout: 20000 });
}

const records = (page) => page.evaluate(() => (skAll || []).map((r) => ({
  brandId: r.brandId, brandName: r.brandName, fileName: r.fileName,
  reportType: r.reportType, section: r.section, status: r.status, createdAt: r.createdAt,
})));

test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "logic flow runs once on desktop"));

test("T1+T7: analyze under HMZA saves a fully-tagged, brand-linked report", async ({ page }) => {
  const errors = watchErrors(page);
  await freshWithBrands(page);
  await gotoSkull(page);
  await analyze(page, BRANDS.A.id, "ppc-week.csv", CSV_A);

  const recs = await records(page);
  expect(recs.length).toBe(1);
  const r = recs[0];
  expect(r.brandId).toBe(BRANDS.A.id);          // linked by ID, not name
  expect(r.brandName).toBe("HMZA");
  expect(r.fileName).toBe("ppc-week.csv");
  expect(r.reportType).toBe("Skull");           // Skull tag present
  expect(r.section).toBe("Skull");
  expect(String(r.status)).toMatch(/Analyzed/);
  expect(errors, errors.join("\n")).toEqual([]);
});

test("T2+T3: HMZA and ANAKZ histories stay isolated by brandId", async ({ page }) => {
  await freshWithBrands(page);
  await gotoSkull(page);
  await analyze(page, BRANDS.A.id, "ppc-week.csv", CSV_A);
  await analyze(page, BRANDS.B.id, "bd-pnl.csv", CSV_B);

  // ANAKZ history shows ONLY ANAKZ's file
  await page.evaluate((id) => { skSelBrand(id); skGo("history"); }, BRANDS.B.id);
  await expect(page.locator("#skHistList")).toContainText("bd-pnl.csv");
  await expect(page.locator("#skHistList")).not.toContainText("ppc-week.csv");

  // HMZA history shows ONLY HMZA's file
  await page.evaluate((id) => { skSelBrand(id); skGo("history"); }, BRANDS.A.id);
  await expect(page.locator("#skHistList")).toContainText("ppc-week.csv");
  await expect(page.locator("#skHistList")).not.toContainText("bd-pnl.csv");

  // brandReports() helper is strictly partitioned
  const counts = await page.evaluate((B) => {
    skSelBrand(B.A.id); const a = skBrandReports().length;
    skSelBrand(B.B.id); const b = skBrandReports().length;
    return { a, b };
  }, BRANDS);
  expect(counts).toEqual({ a: 1, b: 1 });
});

test("T4: history date filter (year/month/day) narrows to the chosen date", async ({ page }) => {
  await freshWithBrands(page);
  await gotoSkull(page);
  await analyze(page, BRANDS.A.id, "ppc-week.csv", CSV_A);

  const { y, m, d } = await page.evaluate(() => { const t = new Date(skAll[0].createdAt); return { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate() }; });
  // matching date → 1 result
  let n = await page.evaluate(({ y, m, d }) => { skUI.hist = { ...skUI.hist, y: String(y), m: String(m), d: String(d) }; return skHistFiltered().length; }, { y, m, d });
  expect(n).toBe(1);
  // a different day → 0 results
  n = await page.evaluate(({ d }) => { skUI.hist.d = String(d === 1 ? 28 : 1); return skHistFiltered().length; }, { d });
  expect(n).toBe(0);
});

// Realistic Search Term Report engineered to trigger every decision branch.
const STR = [
  "Campaign Name,Ad Group Name,Customer Search Term,Match Type,Impressions,Clicks,Spend,7 Day Total Sales,7 Day Total Orders (#)",
  "SP-Charger-Broad,AG1,magsafe charger stand,Broad,4000,60,30.00,300.00,12",   // low ACOS, proven, broad → MOVE TO EXACT
  "SP-Charger-Exact,AG2,wireless charger,Exact,3000,40,24.00,160.00,8",          // ACOS 15%, exact, strong → SCALE
  "SP-Charger-Broad,AG1,free phone charger,Broad,2200,25,18.00,0,0",             // 0 orders, shares "charger" → NEG EXACT
  "SP-Charger-Broad,AG1,dog leash holder,Broad,1800,20,15.00,0,0",               // 0 orders, off-intent → NEG PHRASE
  "SP-Charger-Broad,AG1,car charger mount,Broad,900,6,5.00,25.00,1",             // 1 order → INCREASE BID (not scale)
  "SP-Charger-Broad,AG1,charger cable fast,Broad,2600,30,40.00,50.00,2",         // ACOS 80% converting → REDUCE BID
].join("\n");

test("PPC: Search Term Report yields an operator Action Board, not a summary", async ({ page }) => {
  await freshWithBrands(page);
  await gotoSkull(page);
  await analyze(page, BRANDS.A.id, "Sponsored Products Search term report.csv", STR);

  // structured A–H sections present
  const view = page.locator("#view-skull");
  await expect(view).toContainText("PPC Operator");
  await expect(view).toContainText("Search Term Report");
  await expect(view).toContainText("Direct seller decision");
  await expect(view).toContainText("Final action board");
  await expect(view).toContainText("7-day follow-up");
  // profit-first guardrail wording
  await expect(view).toContainText(/Don.t scale the whole campaign/);

  // the engine produced a board with the right per-term decisions
  const ppc = await page.evaluate(() => {
    const r = skAll[0];
    return { rt: r.ppc.reportType, decs: r.ppc.board.map((b) => b.dec), m: r.ppc.metrics, tgt: r.ppc.targetAcos };
  });
  expect(ppc.rt).toBe("Search Term Report");
  for (const d of ["SCALE", "MOVE TO EXACT", "ADD NEGATIVE EXACT", "ADD NEGATIVE PHRASE", "INCREASE BID", "REDUCE BID"])
    expect(ppc.decs, `expected a ${d} decision, got ${ppc.decs.join(",")}`).toContain(d);
  // metrics computed from real numbers (spend 132, sales 535)
  expect(Math.round(ppc.m.spend)).toBe(132);
  expect(Math.round(ppc.m.sales)).toBe(535);
  expect(ppc.m.acos).toBeGreaterThan(0.24);   // 132/535 ≈ 24.7%
  expect(ppc.m.wasted).toBeGreaterThan(30);    // 18 + 15 wasted on 0-order terms
});

test("T5+T6: reports persist across reload; Back keeps data", async ({ page }) => {
  await freshWithBrands(page);
  await gotoSkull(page);
  await analyze(page, BRANDS.A.id, "ppc-week.csv", CSV_A);

  // T6: open the saved report, hit Back — record still there
  await page.evaluate(() => { skOpen(skAll[0].id); });
  await expect(page.locator("#view-skull")).toContainText("Recommendations");
  await page.click('#view-skull .btn:has-text("Back")');
  expect((await records(page)).length).toBe(1);

  // T5: full reload → IndexedDB rehydrates the report
  await page.reload();
  await waitReady(page);
  await gotoSkull(page);
  const recs = await records(page);
  expect(recs.length).toBe(1);
  expect(recs[0].brandId).toBe(BRANDS.A.id);
  expect(recs[0].fileName).toBe("ppc-week.csv");
});
