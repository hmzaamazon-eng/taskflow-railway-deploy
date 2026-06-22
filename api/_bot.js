// Amazon Bot AI proxy (shared by the Vercel function and the Railway server).
// Keeps the LLM API key server-side. Activates automatically when ANTHROPIC_API_KEY
// or OPENAI_API_KEY is set; otherwise returns {fallback:true} so the browser uses
// its built-in local answer engine. Never throws to the caller — errors degrade to
// the local engine.
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || "";
const OPENAI_KEY = process.env.OPENAI_API_KEY || "";
const BOT_MODEL = process.env.BOT_MODEL || "";

function provider() {
  if (ANTHROPIC_KEY) return "anthropic";
  if (OPENAI_KEY) return "openai";
  return null;
}
function modelFor(p) {
  if (BOT_MODEL) return BOT_MODEL;
  return p === "anthropic" ? "claude-3-5-sonnet-latest" : "gpt-4o-mini";
}
function botStatus() {
  const p = provider();
  return { configured: !!p, provider: p || null, model: p ? modelFor(p) : null };
}

async function botComplete({ messages, system }) {
  const p = provider();
  if (!p) return { fallback: true, reason: "no_api_key" };
  const model = modelFor(p);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45000);
  const safeMsgs = (messages || [])
    .filter((m) => m && m.content != null)
    .slice(-20)
    .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content) }));
  try {
    if (p === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: ctrl.signal,
        headers: { "content-type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model, max_tokens: 1800, system: system || "", messages: safeMsgs }),
      });
      if (!res.ok) throw new Error("anthropic " + res.status + ": " + (await res.text()).slice(0, 300));
      const j = await res.json();
      const reply = (j.content || []).map((c) => c.text || "").join("").trim();
      return { ok: true, reply, provider: p, model };
    } else {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        signal: ctrl.signal,
        headers: { "content-type": "application/json", authorization: "Bearer " + OPENAI_KEY },
        body: JSON.stringify({ model, max_tokens: 1800, messages: [{ role: "system", content: system || "" }, ...safeMsgs] }),
      });
      if (!res.ok) throw new Error("openai " + res.status + ": " + (await res.text()).slice(0, 300));
      const j = await res.json();
      const choice = (j.choices || [])[0] || {};
      const reply = ((choice.message && choice.message.content) || "").trim();
      return { ok: true, reply, provider: p, model };
    }
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { botStatus, botComplete, provider };
