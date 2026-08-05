const { Pool } = require("pg");

// Managed Postgres providers (Render, etc.) terminate SSL with a certificate
// that isn't in Node's default trust store, so full chain verification fails
// with "self-signed certificate in certificate chain". Encryption still
// applies — this only skips CA verification, matching what most providers'
// own connection instructions recommend for app-side clients.
function sslConfig(connectionString) {
  if (!connectionString || /localhost|127\.0\.0\.1/.test(connectionString)) return undefined;
  return { rejectUnauthorized: false };
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfig(process.env.DATABASE_URL),
});

async function query(text, params) {
  return pool.query(text, params);
}

module.exports = { pool, query };
