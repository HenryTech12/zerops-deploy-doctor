// Managed Postgres providers (Render, etc.) terminate SSL with a certificate
// that isn't in Node's default trust store, so full chain verification fails
// with "self-signed certificate in certificate chain". Encryption still
// applies — this only skips CA verification, which matches what most
// providers' own connection instructions recommend for app-side clients.
function pgSsl(connectionString) {
  if (!connectionString || /localhost|127\.0\.0\.1/.test(connectionString)) return undefined;
  return { rejectUnauthorized: false };
}

module.exports = { pgSsl };
