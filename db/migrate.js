// Applies db/schema.sql against DATABASE_URL. Idempotent (all statements use IF NOT EXISTS).
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const { resolveConnectionString } = require("./pgSsl");

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
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

main().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
