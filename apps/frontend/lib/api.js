const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

async function request(path, options) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || `Request failed: ${res.status}`);
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

export { API_URL };
