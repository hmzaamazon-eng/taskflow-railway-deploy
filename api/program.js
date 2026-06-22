// Vercel serverless function: /api/program
// Stores the 30-Day Operator Program progress (checkboxes, reflections, KPIs,
// weekly reviews, vault) as a single shared state row in Postgres.
const { makeHandler } = require("./_store");
module.exports = makeHandler("program", "program");
