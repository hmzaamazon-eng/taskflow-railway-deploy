// Shared storage helper for the Vercel serverless API.
// Files starting with "_" are NOT treated as routes by Vercel — this is a
// helper imported by api/tasks.js and api/products.js.
//
// Each collection is a {id, data, updated_at} Postgres table. Table names come
// from a fixed allowlist (used directly in SQL), never from user input.
const { Pool } = require("pg");

const DATABASE_URL = process.env.DATABASE_URL || "";
const ALLOWED = new Set(["tasks", "products"]);

function needsSSL(url) {
  if (/sslmode=require/i.test(url)) return true;
  if (/railway\.internal|localhost|127\.0\.0\.1/i.test(url)) return false;
  return true; // Neon and most managed Postgres require SSL
}

// Reuse the pool across warm invocations (don't open a new one per request).
let pool = global._tfPool;
if (!pool && DATABASE_URL) {
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: needsSSL(DATABASE_URL) ? { rejectUnauthorized: false } : false,
    max: 1,
  });
  global._tfPool = pool;
}

// Create each table once per warm instance.
const _init = (global._tfInit = global._tfInit || {});
function ensureTable(table) {
  if (!_init[table]) {
    _init[table] = pool
      .query(
        `CREATE TABLE IF NOT EXISTS ${table} (
           id         TEXT PRIMARY KEY,
           data       JSONB NOT NULL,
           updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
         )`
      )
      .catch((e) => {
        _init[table] = null; // allow a retry on the next request
        throw e;
      });
  }
  return _init[table];
}

async function readPayload(req) {
  if (req.body !== undefined && req.body !== null) {
    return typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body;
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function replaceRows(table, items) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM ${table}`);
    for (const it of items) {
      if (!it || typeof it.id !== "string") continue;
      await client.query(
        `INSERT INTO ${table} (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
        [it.id, it]
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// Build a Vercel handler for a given collection. `key` is the JSON property the
// front-end uses (e.g. "tasks" -> { tasks: [...] }).
function makeHandler(table, key) {
  if (!ALLOWED.has(table)) throw new Error("unknown collection: " + table);
  return async (req, res) => {
    if (!pool) {
      res.status(503).json({
        error: "storage_unavailable",
        message:
          "No DATABASE_URL set. In Vercel: Storage → Create Database → Neon (Postgres), then redeploy.",
      });
      return;
    }
    try {
      await ensureTable(table);

      if (req.method === "GET") {
        const { rows } = await pool.query(
          `SELECT data FROM ${table} ORDER BY updated_at ASC`
        );
        res.status(200).json({ [key]: rows.map((r) => r.data) });
        return;
      }

      if (req.method === "PUT" || req.method === "POST") {
        let parsed;
        try {
          parsed = await readPayload(req);
        } catch (e) {
          res.status(400).json({ error: "bad_json" });
          return;
        }
        const items = Array.isArray(parsed) ? parsed : parsed && parsed[key];
        if (!Array.isArray(items)) {
          res.status(400).json({ error: "expected_array", field: key });
          return;
        }
        await replaceRows(table, items);
        res.status(200).json({ ok: true, count: items.length });
        return;
      }

      res.setHeader("Allow", "GET, PUT");
      res.status(405).end("Method Not Allowed");
    } catch (e) {
      console.error("API error:", e.message);
      res.status(500).json({ error: "server_error", message: e.message });
    }
  };
}

module.exports = { makeHandler };
