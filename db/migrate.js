// Applies db/schema.sql against DATABASE_URL. Idempotent (all statements use IF NOT EXISTS).
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const { resolveConnectionString } = require("./pgSsl");

async function migrate() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set.");
  }

  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  const client = new Client({ connectionString: resolveConnectionString(databaseUrl) });
  await client.connect();
  try {
    await client.query(schema);
    console.log("Schema applied successfully.");
  } finally {
    await client.end();
  }
}

// Run directly (e.g. `npm run db:migrate`) as a standalone script; when
// required as a module (see apps/api/src/index.js), only `migrate` runs.
if (require.main === module) {
  migrate().catch((err) => {
    console.error("Migration failed:", err.message);
    process.exit(1);
  });
}

module.exports = { migrate };
