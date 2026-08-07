// Which repo/branch/file F2's apply-fix commits to — set via the "Connect
// repo" UI (backed by the repo_connection singleton row) instead of the old
// static PATIENT_REPO env var. Falls back to env vars if nothing's been
// connected yet, so existing deployments keep working unchanged.
const { query } = require("../db");

async function getConnection() {
  const { rows } = await query("SELECT owner, repo, branch, yaml_path FROM repo_connection WHERE id = 1");
  if (rows[0]) return rows[0];

  if (!process.env.PATIENT_REPO) return null;
  const [owner, repo] = process.env.PATIENT_REPO.split("/");
  return {
    owner,
    repo,
    branch: process.env.PATIENT_REPO_BRANCH || "main",
    yaml_path: process.env.PATIENT_REPO_YAML_PATH || "zerops.yaml",
  };
}

async function setConnection({ owner, repo, branch, yaml_path }) {
  const { rows } = await query(
    `INSERT INTO repo_connection (id, owner, repo, branch, yaml_path, updated_at)
     VALUES (1, $1, $2, $3, $4, now())
     ON CONFLICT (id) DO UPDATE SET
       owner = EXCLUDED.owner, repo = EXCLUDED.repo, branch = EXCLUDED.branch,
       yaml_path = EXCLUDED.yaml_path, updated_at = now()
     RETURNING owner, repo, branch, yaml_path`,
    [owner, repo, branch || "main", yaml_path || "zerops.yaml"]
  );
  return rows[0];
}

module.exports = { getConnection, setConnection };
