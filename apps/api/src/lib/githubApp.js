// GitHub App authentication — signs a JWT with the App's private key and
// exchanges it for a short-lived (1hr) installation access token, scoped to
// exactly the repo(s) granted when the App was installed. This is the same
// mechanism Vercel/Netlify/Render use for repo access: no static long-lived
// PAT sitting in an env var, and access is revocable/scoped from GitHub's
// side by uninstalling or editing the App's repo selection.
const crypto = require("crypto");

const API_BASE = "https://api.github.com";

function base64url(input) {
  return Buffer.from(input).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

// GitHub private keys are PEM (multi-line). A single-line env var field
// can't hold real newlines, so this accepts either the raw PEM or a
// version with literal "\n" escape sequences in place of real newlines.
function normalizePrivateKey(key) {
  return key.includes("\\n") ? key.replace(/\\n/g, "\n") : key;
}

function signAppJWT() {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  if (!appId || !privateKey) {
    throw new Error("GITHUB_APP_ID or GITHUB_APP_PRIVATE_KEY not configured");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  // iat backdated 60s and a 10-minute exp — GitHub rejects JWTs issued in
  // the future if there's any clock drift, and caps App JWT lifetime at 10m.
  // iss must be numeric — env vars are always strings, and GitHub rejected
  // a string iss live ("A JSON web token could not be decoded").
  const payload = base64url(JSON.stringify({ iat: now - 60, exp: now + 600, iss: Number(appId) }));
  const signingInput = `${header}.${payload}`;

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer
    .sign(normalizePrivateKey(privateKey))
    .toString("base64")
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `${signingInput}.${signature}`;
}

function appHeaders() {
  return {
    Authorization: `Bearer ${signAppJWT()}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "DeployDoctor",
  };
}

// Single-tenant by design (see README roadmap re: GitHub App + real
// multi-user sessions) — this App has exactly one installation, so it's
// looked up once and cached rather than needing a stored mapping.
let cachedInstallationId = null;

async function getInstallationId() {
  if (cachedInstallationId) return cachedInstallationId;

  const res = await fetch(`${API_BASE}/app/installations`, { headers: appHeaders() });
  if (!res.ok) {
    throw new Error(`GitHub App installations lookup failed: ${res.status} ${await res.text()}`);
  }
  const installations = await res.json();
  if (!installations[0]) {
    throw new Error("GitHub App has no installations — install it on the patient repo first");
  }

  cachedInstallationId = installations[0].id;
  return cachedInstallationId;
}

let cachedToken = null; // { token, expiresAt }

/** Short-lived (~1hr) token scoped to exactly what this installation was granted. */
async function getInstallationToken() {
  if (cachedToken && new Date(cachedToken.expiresAt).getTime() - Date.now() > 60_000) {
    return cachedToken.token;
  }

  const installationId = await getInstallationId();
  const res = await fetch(`${API_BASE}/app/installations/${installationId}/access_tokens`, {
    method: "POST",
    headers: appHeaders(),
  });
  if (!res.ok) {
    throw new Error(`GitHub App installation token request failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  cachedToken = { token: data.token, expiresAt: data.expires_at };
  return cachedToken.token;
}

module.exports = {
  getInstallationToken,
  isConfigured: () => Boolean(process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY),
};
