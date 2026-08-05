const { Pool } = require("pg");

// Managed Postgres providers terminate SSL with a certificate that isn't in
// Node's default trust store, so full chain verification fails with
// "self-signed certificate in certificate chain". Encryption still applies —
// this only skips CA verification.
//
// node-postgres has a sharp edge here: when a connectionString is passed,
// values parsed FROM it (via pg-connection-string) win over an explicit
// `ssl` config object passed alongside it — so `sslmode=require` in the URL
// silently overrides `ssl: {rejectUnauthorized:false}`. The reliable fix is
// to rewrite the URL's sslmode to `no-verify` directly, which
// pg-connection-string parses straight into `{rejectUnauthorized:false}`
// with nothing left to override it.
function resolveConnectionString(connectionString) {
  if (!connectionString) return connectionString;
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    return connectionString;
  }
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return connectionString;
  url.searchParams.set("sslmode", "no-verify");
  return url.toString();
}

const pool = new Pool({
  connectionString: resolveConnectionString(process.env.DATABASE_URL),
});

async function query(text, params) {
  return pool.query(text, params);
}

module.exports = { pool, query };
