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
    await migrateSingletonConnection(client);
  } finally {
    await client.end();
  }
}

// One-time carry-forward: repo_connection was a single hardcoded row before
// repo_sessions (named, multiple, switchable) replaced it. If a database
// still has that old row and nothing's been saved as a session yet, turn
// it into one named after the repo instead of silently losing it.
async function migrateSingletonConnection(client) {
  const { rows: sessions } = await client.query("SELECT 1 FROM repo_sessions LIMIT 1");
  if (sessions.length) return;

  const { rows: legacy } = await client.query("SELECT * FROM repo_connection WHERE id = 1");
  if (!legacy.length) return;

  const { customAlphabet } = require("nanoid");
  const nanoid = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 8);
  const { owner, repo, branch, yaml_path } = legacy[0];
  await client.query(
    `INSERT INTO repo_sessions (id, name, owner, repo, branch, yaml_path, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, true)`,
    [nanoid(), repo, owner, repo, branch, yaml_path]
  );
  console.log(`Carried forward existing repo_connection as a session named "${repo}".`);
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
