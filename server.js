// TaskFlow server for Railway.
// Serves the single-file app AND persists tasks in Postgres so data is
// shared across every device/browser (not just the local one).
//
// Persistence is enabled automatically when a DATABASE_URL is present
// (Railway sets this when you add a Postgres database to the project).
// If no database is configured the app still runs, but the API reports
// that storage is unavailable and the front-end falls back to the
// browser's local cache.
const http = require("http");
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const PORT = process.env.PORT || 3000;
const INDEX = path.join(__dirname, "index.html");
const MAX_BODY = 30 * 1024 * 1024; // 30 MB — generous room for attachments

let html;
try {
  html = fs.readFileSync(INDEX);
} catch (e) {
  console.error("Could not read index.html:", e.message);
  process.exit(1);
}

/* ----------------------------- Database ----------------------------- */
const DATABASE_URL = process.env.DATABASE_URL || "";
let pool = null;
let dbReady = false;

function needsSSL(url) {
  // Railway's internal network and local Postgres don't use SSL; public
  // proxy connections (and most managed providers) do.
  if (/sslmode=require/i.test(url)) return true;
  if (/railway\.internal|localhost|127\.0\.0\.1/i.test(url)) return false;
  return true;
}

async function initDb() {
  if (!DATABASE_URL) {
    console.warn(
      "No DATABASE_URL set — tasks will NOT be saved on the server. " +
        "Add a Postgres database in Railway to enable shared persistence."
    );
    return;
  }
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: needsSSL(DATABASE_URL) ? { rejectUnauthorized: false } : false,
    max: 5,
  });
  pool.on("error", (err) => console.error("Postgres pool error:", err.message));

  // Retry a few times: on a fresh deploy the DB may still be starting up.
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await pool.query(
        `CREATE TABLE IF NOT EXISTS tasks (
           id         TEXT PRIMARY KEY,
           data       JSONB NOT NULL,
           updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
         )`
      );
      dbReady = true;
      console.log("Postgres connected — task persistence is ON.");
      return;
    } catch (e) {
      console.error(
        `DB init attempt ${attempt} failed: ${e.message}` +
          (attempt < 5 ? " — retrying…" : "")
      );
      if (attempt < 5) await new Promise((r) => setTimeout(r, attempt * 1000));
    }
  }
}

async function getTasks() {
  const { rows } = await pool.query("SELECT data FROM tasks ORDER BY updated_at ASC");
  return rows.map((r) => r.data);
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

/* ----------------------------- HTTP helpers ----------------------------- */
function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error("Payload too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/* ----------------------------- Server ----------------------------- */
const server = http.createServer(async (req, res) => {
  const url = (req.url || "/").split("?")[0];

  // Health check for Railway
  if (url === "/healthz") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    return res.end("ok");
  }

  // ---- API ----
  if (url === "/api/tasks") {
    if (!dbReady) {
      return sendJSON(res, 503, {
        error: "storage_unavailable",
        message:
          "Server storage is not configured. Add a Postgres database in Railway.",
      });
    }
    try {
      if (req.method === "GET") {
        const tasks = await getTasks();
        return sendJSON(res, 200, { tasks });
      }
      if (req.method === "PUT" || req.method === "POST") {
        const raw = await readBody(req);
        let parsed;
        try {
          parsed = JSON.parse(raw || "{}");
        } catch (e) {
          return sendJSON(res, 400, { error: "bad_json" });
        }
        const tasks = Array.isArray(parsed) ? parsed : parsed.tasks;
        if (!Array.isArray(tasks)) {
          return sendJSON(res, 400, { error: "expected_tasks_array" });
        }
        await replaceTasks(tasks);
        return sendJSON(res, 200, { ok: true, count: tasks.length });
      }
      res.writeHead(405, { Allow: "GET, PUT" });
      return res.end("Method Not Allowed");
    } catch (e) {
      console.error("API error:", e.message);
      return sendJSON(res, 500, { error: "server_error", message: e.message });
    }
  }

  // ---- Single-file app: every other route returns the app ----
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-cache",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(html);
});

initDb().finally(() => {
  server.listen(PORT, "0.0.0.0", () => {
    console.log("TaskFlow is running on port " + PORT);
  });
});
