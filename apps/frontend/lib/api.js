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

export function diagnose({
  yaml,
  log,
  text,
  repo_url,
  use_connected_repo,
  file_paths,
  replay_id,
  username,
}) {
  return request("/api/diagnose", {
    method: "POST",
    body: JSON.stringify({
      yaml,
      log,
      text,
      repo_url,
      use_connected_repo,
      file_paths,
      replay_id,
      username,
    }),
  });
}

export function getMyReplays(username, limit = 10) {
  return request(`/api/replay?username=${encodeURIComponent(username)}&limit=${limit}`);
}

export function applyFix({ replay_id, fixed_yaml, pattern_id }) {
  return request("/api/apply-fix", {
    method: "POST",
    body: JSON.stringify({ replay_id, fixed_yaml, pattern_id }),
  });
}

export function applyCodeFix({ replay_id, file_path, code_suggestion, pattern_id }) {
  return request("/api/apply-code-fix", {
    method: "POST",
    body: JSON.stringify({ replay_id, file_path, code_suggestion, pattern_id }),
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

export function getWatchState() {
  return request("/api/watch/state");
}

export function enableWatch() {
  return request("/api/watch/enable", { method: "POST" });
}

export function disableWatch() {
  return request("/api/watch/disable", { method: "POST" });
}

export function listWatchNotifications(onlyUnseen = false) {
  return request(`/api/watch/notifications${onlyUnseen ? "?unseen=true" : ""}`);
}

export function getWatchNotification(id) {
  return request(`/api/watch/notifications/${id}`);
}

export function markNotificationSeen(id) {
  return request(`/api/watch/notifications/${id}/seen`, { method: "POST" });
}

export function markAllNotificationsSeen() {
  return request("/api/watch/notifications/seen-all", { method: "POST" });
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

export function getGithubConnectionContent() {
  return request("/api/github/connection/content");
}

export function listGithubRepoBranches(owner, repo) {
  return request(`/api/github/repos/${owner}/${repo}/branches`);
}

export function listGithubRepoSourceFiles(owner, repo, branch) {
  return request(`/api/github/repos/${owner}/${repo}/source-files?branch=${encodeURIComponent(branch)}`);
}

export function listGithubSessions() {
  return request("/api/github/sessions");
}

export function createGithubSession({ name, owner, repo, branch, yaml_path, username }) {
  return request("/api/github/sessions", {
    method: "POST",
    body: JSON.stringify({ name, owner, repo, branch, yaml_path, username }),
  });
}

export function activateGithubSession(id) {
  return request(`/api/github/sessions/${id}/activate`, { method: "POST" });
}

export function renameGithubSession(id, name) {
  return request(`/api/github/sessions/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export function deleteGithubSession(id) {
  return request(`/api/github/sessions/${id}`, { method: "DELETE" });
}

export { API_URL };
