// Vercel serverless function: /api/products
// FBA Finder product research list backed by Postgres.
const { makeHandler } = require("./_store");
module.exports = makeHandler("products", "products");
