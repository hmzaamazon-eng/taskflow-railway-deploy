// One-time product seed for FBA Finder.
// Inserts the initial niche list into the `products` table exactly once per
// database, tracked by a marker row in `_seeds`. Idempotent and race-safe:
// - won't duplicate on repeated deploys / cold starts
// - won't re-add a product the user later deletes (the marker stays set)
// To push a new batch later, bump SEED_KEY (e.g. ..._v2) and add names.

const SEED_KEY = "fba_party_decorations_v1";

const PRODUCT_SEED = [
  "disco party decorations",
  "love island party decorations",
  "mermaid party decorations",
  "little mermaid party decorations",
  "neon party decorations",
  "red birthday decorations",
  "casino theme party decorations",
  "race car birthday party decorations",
  "fishing birthday party decorations",
  "dog party decorations",
  "two sweet birthday decorations",
  "monster truck birthday decorations",
  "mamma mia party decorations",
  "3rd birthday decorations for girls",
  "candyland party decorations",
  "carnival theme party decorations",
  "taco party decorations",
  "basketball birthday party decorations",
  "party animal birthday decorations",
  "cat party decorations",
  "silly goose birthday decorations",
  "gamer birthday party decorations",
  "mean girls party decorations",
  "cars themed birthday party decorations",
  "girls birthday party decorations",
  "cowboy birthday party decorations",
  "farm birthday decorations",
  "sports birthday party decorations",
  "jungle party decorations",
  "lemon party decorations",
  "ice cream birthday party decorations",
  "italian party decorations",
  "pool party birthday decorations",
  "two cool birthday party decorations boy",
  "airplane party decorations",
];

// Insert the seed list once. `pool` is a pg Pool. Returns the number inserted.
async function seedProducts(pool) {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS _seeds (
       key TEXT PRIMARY KEY,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`
  );
  // Fast path: already applied.
  const pre = await pool.query("SELECT 1 FROM _seeds WHERE key = $1", [SEED_KEY]);
  if (pre.rowCount) return 0;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Claim the marker; if another process beat us, bail out cleanly.
    const claim = await client.query(
      "INSERT INTO _seeds (key) VALUES ($1) ON CONFLICT (key) DO NOTHING RETURNING key",
      [SEED_KEY]
    );
    if (!claim.rowCount) {
      await client.query("ROLLBACK");
      return 0;
    }
    const seen = new Set();
    let i = 0;
    for (const rawName of PRODUCT_SEED) {
      const name = rawName.trim();
      const k = name.toLowerCase();
      if (!name || seen.has(k)) continue;
      seen.add(k);
      const id = "seed_" + Date.now().toString(36) + "_" + i++;
      const data = { id, name, asin: "", searchVol: null, competitors: null, createdAt: Date.now() };
      await client.query(
        "INSERT INTO products (id, data) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING",
        [id, data]
      );
    }
    await client.query("COMMIT");
    return i;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { seedProducts, SEED_KEY, PRODUCT_SEED };
