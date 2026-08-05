// Managed Postgres providers terminate SSL with a certificate that isn't in
// Node's default trust store, so full chain verification fails with
// "self-signed certificate in certificate chain". Encryption still applies —
// this only skips CA verification.
//
// node-postgres has a sharp edge here: when a connectionString is passed
// alongside a separate `ssl` config object, values parsed FROM the
// connection string (via pg-connection-string) win over the explicit `ssl`
// object — so `sslmode=require` in the URL silently overrides `ssl:
// {rejectUnauthorized:false}` passed alongside it. The reliable fix is to
// rewrite the URL's sslmode to `no-verify` directly, which pg-connection-string
// parses straight into `{rejectUnauthorized:false}` with nothing to override it.
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

module.exports = { resolveConnectionString };
