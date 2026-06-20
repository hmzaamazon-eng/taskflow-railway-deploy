// Minimal zero-dependency static server for Railway.
// Serves the single-file TaskFlow app. Railway provides PORT; we bind 0.0.0.0.
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const INDEX = path.join(__dirname, "index.html");

let html;
try {
  html = fs.readFileSync(INDEX);
} catch (e) {
  console.error("Could not read index.html:", e.message);
  process.exit(1);
}

const server = http.createServer((req, res) => {
  // Lightweight health endpoint for Railway checks
  if (req.url === "/healthz") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    return res.end("ok");
  }
  // Single-file app: every route returns the app
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-cache",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(html);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("TaskFlow is running on port " + PORT);
});
