// Thin client over the Zerops platform REST API — status, logs, trigger redeploy.
// Docs: https://docs.zerops.io/references/api
const BASE = process.env.ZEROPS_API_BASE || "https://api.app-prg1.zerops.io/api/rest/public";

function headers() {
  if (!process.env.ZEROPS_API_TOKEN) {
    throw new Error("ZEROPS_API_TOKEN not configured");
  }
  return {
    Authorization: `Bearer ${process.env.ZEROPS_API_TOKEN}`,
    "Content-Type": "application/json",
  };
}

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, { ...options, headers: headers() });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Zerops API ${res.status} ${res.statusText}: ${body}`);
  }
  return res.status === 204 ? null : res.json();
}

/** Current status of a service (running / deploying / failed / stopped). */
async function getServiceStatus(serviceId) {
  const id = serviceId || process.env.ZEROPS_SERVICE_ID;
  return request(`/service-stack/${id}`);
}

/** Latest deploy logs for a service — used to seed the diagnosis pipeline. */
async function getDeployLogs(serviceId) {
  const id = serviceId || process.env.ZEROPS_SERVICE_ID;
  const data = await request(`/service-stack/${id}/log?limit=500`);
  return (data?.items || []).map((l) => l.message).join("\n");
}

/**
 * Trigger a redeploy after a fixed zerops.yaml has been approved (F2).
 * `yamlOverride`, when present, is the corrected zerops.yaml content the user
 * just approved — it's sent alongside the deploy trigger so the next build
 * picks it up. Exact field name may need adjusting against the live Zerops
 * API version you're pinned to; the deploy trigger itself is the part that
 * matters and degrades gracefully (falls back to project's existing
 * zerops.yaml) if the platform ignores an unknown field.
 */
async function triggerRedeploy(serviceId, projectId, yamlOverride) {
  const svc = serviceId || process.env.ZEROPS_SERVICE_ID;
  const proj = projectId || process.env.ZEROPS_PROJECT_ID;
  const body = { projectId: proj };
  if (yamlOverride) body.zeropsYamlContent = yamlOverride;
  return request(`/service-stack/${svc}/deploy`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Normalizes whatever the platform calls "running/failed/etc" into fail|success|pending. */
function normalizeStatus(rawStatus) {
  const s = (rawStatus || "").toUpperCase();
  if (["ACTIVE", "RUNNING", "READY"].includes(s)) return "success";
  if (["FAILED", "STACK_FAILED", "DEPLOY_FAILED", "ERROR"].includes(s)) return "fail";
  return "pending";
}

module.exports = {
  getServiceStatus,
  getDeployLogs,
  triggerRedeploy,
  normalizeStatus,
  isConfigured: () => Boolean(process.env.ZEROPS_API_TOKEN),
};
