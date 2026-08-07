// Hardcoded, not read from NEXT_PUBLIC_API_URL: a stale/incorrect value for
// that env var on the hosting platform's dashboard (wrong path, build-cache
// reuse of an old baked value) repeatedly caused silent 404s that were hard
// to diagnose from the client alone. Change this constant directly instead.
const API_URL = "https://api-2ab2-3001.prg1.zerops.app";

async function request(path, options) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = [body.error, body.detail].filter(Boolean).join(": ");
    throw new Error(message || `Request failed: ${res.status}`);
  }
  return body;
}

export function diagnose({ yaml, log, text, repo_url, replay_id }) {
  return request("/api/diagnose", {
    method: "POST",
    body: JSON.stringify({ yaml, log, text, repo_url, replay_id }),
  });
}

export function applyFix({ replay_id, fixed_yaml, pattern_id }) {
  return request("/api/apply-fix", {
    method: "POST",
    body: JSON.stringify({ replay_id, fixed_yaml, pattern_id }),
  });
}

export function getStatus(replayId) {
  return request(`/api/status/${replayId}`);
}

export function getReplay(replayId) {
  return request(`/api/replay/${replayId}`);
}

export function getPatternStats(patternId) {
  return request(`/api/patterns/${patternId}/stats`);
}

export function getWatchStatus() {
  return request("/api/watch/status");
}

export function getGithubAppInfo() {
  return request("/api/github/app-info");
}

export function listGithubRepos() {
  return request("/api/github/repos");
}

export function listGithubRepoFiles(owner, repo, branch) {
  return request(`/api/github/repos/${owner}/${repo}/files?branch=${encodeURIComponent(branch)}`);
}

export function getGithubConnection() {
  return request("/api/github/connection");
}

export function saveGithubConnection({ owner, repo, branch, yaml_path }) {
  return request("/api/github/connection", {
    method: "POST",
    body: JSON.stringify({ owner, repo, branch, yaml_path }),
  });
}

export { API_URL };
