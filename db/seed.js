// Loads db/seed.sql (categories 1-3 failure_patterns) against DATABASE_URL.
// Safe to re-run: seed.sql relies on unique-ish inserts guarded by ON CONFLICT DO NOTHING.
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const { resolveConnectionString } = require("./pgSsl");

async function seed() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set.");
  }

  const seedSql = fs.readFileSync(path.join(__dirname, "seed.sql"), "utf8");
  const client = new Client({ connectionString: resolveConnectionString(databaseUrl) });
  await client.connect();
  try {
    await client.query(seedSql);
    const { rows } = await client.query("SELECT count(*)::int AS n FROM failure_patterns");
    console.log(`Seed applied. failure_patterns now has ${rows[0].n} rows.`);
  } finally {
    await client.end();
  }
}

// Run directly (e.g. `npm run db:seed`) as a standalone script; when
// required as a module (see apps/api/src/index.js), only `seed` runs.
if (require.main === module) {
  seed().catch((err) => {
    console.error("Seed failed:", err.message);
    process.exit(1);
  });
}

module.exports = { seed };
