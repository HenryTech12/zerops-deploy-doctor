// F7 — fetch relevant source files from a public GitHub repo so the LLM can
// locate the offending code. Read-only: DeployDoctor never writes to the repo.
const RAW_BASE = "https://raw.githubusercontent.com";
const API_BASE = "https://api.github.com";

function parseRepoUrl(repoUrl) {
  const m = repoUrl.match(/github\.com\/([^/]+)\/([^/.#?]+)/i);
  if (!m) throw new Error("Not a valid GitHub repo URL");
  return { owner: m[1], repo: m[2] };
}

function ghHeaders() {
  const h = { "User-Agent": "DeployDoctor" };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

async function getDefaultBranch(owner, repo) {
  const res = await fetch(`${API_BASE}/repos/${owner}/${repo}`, { headers: ghHeaders() });
  if (!res.ok) throw new Error(`GitHub repo lookup failed: ${res.status}`);
  const data = await res.json();
  return data.default_branch || "main";
}

/** Lists files in the repo tree, capped, so callers can pick likely candidates. */
async function listTree(owner, repo, branch) {
  const res = await fetch(`${API_BASE}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`, {
    headers: ghHeaders(),
  });
  if (!res.ok) throw new Error(`GitHub tree fetch failed: ${res.status}`);
  const data = await res.json();
  return (data.tree || []).filter((n) => n.type === "blob").map((n) => n.path);
}

async function fetchRawFile(owner, repo, branch, filePath) {
  const res = await fetch(`${RAW_BASE}/${owner}/${repo}/${branch}/${filePath}`, {
    headers: ghHeaders(),
  });
  if (!res.ok) return null;
  return res.text();
}

// Heuristic shortlist: source files most likely to contain the entrypoint /
// config-reading logic an error log would point back to.
const CANDIDATE_PATTERNS = [
  /^(src\/)?index\.(js|ts|mjs)$/i,
  /^(src\/)?server\.(js|ts|mjs)$/i,
  /^(src\/)?app\.(js|ts|mjs)$/i,
  /^(src\/)?main\.(js|ts|mjs|py|go)$/i,
  /^(src\/)?db\.(js|ts)$/i,
];

/**
 * Given a repo URL, fetch a small set of likely-relevant source files as
 * `path:\n<contents>` blocks to pass into the LLM's "Source files" context.
 */
async function fetchRelevantSources(repoUrl, maxFiles = 4) {
  const { owner, repo } = parseRepoUrl(repoUrl);
  const branch = await getDefaultBranch(owner, repo);
  const paths = await listTree(owner, repo, branch);

  const candidates = paths.filter((p) => CANDIDATE_PATTERNS.some((re) => re.test(p)));
  const shortlist = (candidates.length ? candidates : paths.filter((p) => /\.(js|ts)$/.test(p))).slice(
    0,
    maxFiles
  );

  const files = await Promise.all(
    shortlist.map(async (p) => ({ path: p, content: await fetchRawFile(owner, repo, branch, p) }))
  );

  return files
    .filter((f) => f.content)
    .map((f) => `--- ${f.path} ---\n${f.content}`)
    .join("\n\n");
}

module.exports = { parseRepoUrl, fetchRelevantSources };
