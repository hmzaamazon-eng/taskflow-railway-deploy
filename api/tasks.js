// Vercel serverless function: /api/tasks
// Shared task list backed by Postgres. See api/_store.js for the implementation.
const { makeHandler } = require("./_store");
module.exports = makeHandler("tasks", "tasks");
