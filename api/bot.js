// Vercel serverless function: /api/bot
// GET  -> AI configuration status (so the UI knows live vs local mode)
// POST -> proxy a chat completion to the configured LLM (key stays server-side)
const { botStatus, botComplete } = require("./_bot");

module.exports = async (req, res) => {
  try {
    if (req.method === "GET") {
      res.status(200).json(botStatus());
      return;
    }
    if (req.method === "POST") {
      let body = req.body;
      if (body === undefined || body === null) {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      } else if (typeof body === "string") {
        body = JSON.parse(body || "{}");
      }
      const messages = Array.isArray(body.messages) ? body.messages : [];
      if (!messages.length) {
        res.status(400).json({ error: "no_messages" });
        return;
      }
      const out = await botComplete({ messages, system: String(body.system || "") });
      res.status(200).json(out);
      return;
    }
    res.setHeader("Allow", "GET, POST");
    res.status(405).end("Method Not Allowed");
  } catch (e) {
    // Degrade to the client's local engine rather than failing the request.
    res.status(200).json({ error: "ai_error", message: String((e && e.message) || e), fallback: true });
  }
};
