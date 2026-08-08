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

// GitHub private keys are PEM (multi-line). Env var UIs mangle that in a
// few different ways depending on how the value was pasted — this repairs
// each one rather than assuming a single format:
//   - base64-encoded PEM (recommended — see README; immune to every kind of
//     whitespace/newline mangling below since it round-trips exactly)
//   - wrapping quotes some UIs add literally around a pasted value
//   - real newlines converted to literal "\n" escape sequences
//   - CRLF line endings
//   - newlines dropped entirely, collapsing the whole PEM onto one line
//     (seen live: this alone still produced Node's undecodable-key error,
//     which is why base64 is now the recommended path)
function normalizePrivateKey(key) {
  let k = key.trim();

  if ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'"))) {
    k = k.slice(1, -1).trim();
  }

  if (!k.includes("BEGIN")) {
    try {
      const decoded = Buffer.from(k, "base64").toString("utf8");
      if (decoded.includes("BEGIN")) k = decoded.trim();
    } catch {
      // not base64 — fall through and let the PEM repairs below try
    }
  }

  if (k.includes("\\n")) k = k.replace(/\\n/g, "\n");
  k = k.replace(/\r\n/g, "\n").trim();

  if (!k.includes("\n")) {
    const m = k.match(/-----BEGIN ([A-Z ]+)-----(.*)-----END \1-----/);
    if (m) {
      const label = m[1];
      const body = m[2].replace(/\s+/g, "");
      const wrapped = body.match(/.{1,64}/g).join("\n");
      k = `-----BEGIN ${label}-----\n${wrapped}\n-----END ${label}-----\n`;
    }
  }

  return k;
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

  const normalizedKey = normalizePrivateKey(privateKey);
  if (!normalizedKey.includes("BEGIN") || !normalizedKey.includes("END")) {
    // Fails fast with something actionable instead of OpenSSL's opaque
    // "DECODER routines::unsupported" — the key value that reached this
    // process doesn't even look like PEM/base64-PEM after every repair
    // attempt, which usually means it was truncated when pasted/saved.
    throw new Error(
      `GITHUB_APP_PRIVATE_KEY doesn't look like a valid key after normalization (length ${normalizedKey.length}, no BEGIN/END markers) — it was likely truncated or corrupted when set. Re-copy the .pem file's full contents, or base64-encode it first (see README).`
    );
  }

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  let signature;
  try {
    signature = signer
      .sign(normalizedKey)
      .toString("base64")
      .replace(/=+$/, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  } catch (err) {
    throw new Error(
      `Failed to sign with GITHUB_APP_PRIVATE_KEY (${err.message}) — the key value (length ${normalizedKey.length} after normalization) isn't valid PEM. Re-copy the .pem file's full contents, or base64-encode it first (see README).`
    );
  }

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

let cachedAppInfo = null;

/** The App's own public metadata (slug, name, html_url) — used to build the
 * "install this App" link without hardcoding a slug that could drift from
 * whatever name was actually available when the App was registered. */
async function getAppInfo() {
  if (cachedAppInfo) return cachedAppInfo;

  const res = await fetch(`${API_BASE}/app`, { headers: appHeaders() });
  if (!res.ok) {
    throw new Error(`GitHub App info lookup failed: ${res.status} ${await res.text()}`);
  }
  cachedAppInfo = await res.json();
  return cachedAppInfo;
}

/** Every repo this App's single installation currently has access to,
 * newest-created first. GitHub paginates this endpoint (default 30/page,
 * oldest-granted first) — a repo installed after the first ~30 wouldn't
 * show up at all without walking every page. */
async function listInstallationRepos() {
  // getInstallationToken() calls getInstallationId() internally, which is
  // where the clear "install the App first" error surfaces if there's no
  // installation yet.
  const token = await getInstallationToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "DeployDoctor",
  };

  const all = [];
  for (let page = 1; ; page++) {
    const res = await fetch(
      `${API_BASE}/installation/repositories?per_page=100&page=${page}`,
      { headers }
    );
    if (!res.ok) {
      throw new Error(`GitHub installation repos lookup failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    all.push(...(data.repositories || []));
    if (!data.repositories || data.repositories.length < 100 || all.length >= data.total_count) break;
  }

  return all
    .map((r) => ({
      owner: r.owner.login,
      repo: r.name,
      full_name: r.full_name,
      default_branch: r.default_branch,
      private: r.private,
      created_at: r.created_at,
    }))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

module.exports = {
  getInstallationToken,
  getAppInfo,
  listInstallationRepos,
  isConfigured: () => Boolean(process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY),
};
