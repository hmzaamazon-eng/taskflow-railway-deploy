// Vercel serverless function: /api/tasks
// Handles GET (list) and PUT/POST (replace all) for the shared task list,
// backed by Postgres (Neon on Vercel). Mirrors the Railway server's API so the
// front-end works unchanged on either platform.
//
// On Vercel, add a Postgres database via Storage → Neon; it injects
// DATABASE_URL automatically. Use the POOLED connection string (the default
// DATABASE_URL) — serverless opens many short-lived connections.
const { Pool } = require("pg");

const DATABASE_URL = process.env.DATABASE_URL || "";

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
    max: 1, // each warm function instance keeps at most one connection
  });
  global._tfPool = pool;
}

// Create the table once per warm instance.
let _initPromise = null;
function ensureTable() {
  if (!_initPromise) {
    _initPromise = pool
      .query(
        `CREATE TABLE IF NOT EXISTS tasks (
           id         TEXT PRIMARY KEY,
           data       JSONB NOT NULL,
           updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
         )`
      )
      .catch((e) => {
        _initPromise = null; // allow a retry on the next request
        throw e;
      });
  }
  return _initPromise;
}

async function readPayload(req) {
  if (req.body !== undefined && req.body !== null) {
    return typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body;
  }
  // Fallback: read the raw stream if Vercel didn't pre-parse the body.
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function replaceTasks(tasks) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM tasks");
    for (const t of tasks) {
      if (!t || typeof t.id !== "string") continue;
      await client.query(
        "INSERT INTO tasks (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()",
        [t.id, t]
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

module.exports = async (req, res) => {
  if (!pool) {
    res.status(503).json({
      error: "storage_unavailable",
      message:
        "No DATABASE_URL set. In Vercel: Storage → Create Database → Neon (Postgres), then redeploy.",
    });
    return;
  }
  try {
    await ensureTable();

    if (req.method === "GET") {
      const { rows } = await pool.query(
        "SELECT data FROM tasks ORDER BY updated_at ASC"
      );
      res.status(200).json({ tasks: rows.map((r) => r.data) });
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
      const tasks = Array.isArray(parsed) ? parsed : parsed && parsed.tasks;
      if (!Array.isArray(tasks)) {
        res.status(400).json({ error: "expected_tasks_array" });
        return;
      }
      await replaceTasks(tasks);
      res.status(200).json({ ok: true, count: tasks.length });
      return;
    }

    res.setHeader("Allow", "GET, PUT");
    res.status(405).end("Method Not Allowed");
  } catch (e) {
    console.error("API error:", e.message);
    res.status(500).json({ error: "server_error", message: e.message });
  }
};
