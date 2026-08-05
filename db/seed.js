// Loads db/seed.sql (categories 1-3 failure_patterns) against DATABASE_URL.
// Safe to re-run: seed.sql relies on unique-ish inserts guarded by ON CONFLICT DO NOTHING.
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const seed = fs.readFileSync(path.join(__dirname, "seed.sql"), "utf8");
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(seed);
    const { rows } = await client.query("SELECT count(*)::int AS n FROM failure_patterns");
    console.log(`Seed applied. failure_patterns now has ${rows[0].n} rows.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
