// Named, saved repo connections ("sessions") — replaces the old single
// hardcoded repo_connection row so a user can save more than one repo they
// work with (e.g. one per project) and switch which one F2's apply-fix and
// "Analyze codebase" target, instead of overwriting the same slot every
// time. Falls back to env vars if nothing's ever been saved, so existing
// deployments keep working unchanged.
const { customAlphabet } = require("nanoid");
const { query, pool } = require("../db");

// pool.query() (via the shared query() helper) hands out a different
// connection per call, so BEGIN/UPDATE/COMMIT as separate query() calls
// would silently run as three independent auto-committed statements, not
// one transaction. These two writes need "clear the old active flag and
// set the new one" to be atomic, so they use a single checked-out client.
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

const nanoid = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 8);
const MAX_NAME_LENGTH = 60;

function validateName(name) {
  const trimmed = (name || "").trim();
  if (!trimmed) throw new Error("Session name is required.");
  if (trimmed.length > MAX_NAME_LENGTH) {
    throw new Error(`Session name must be ${MAX_NAME_LENGTH} characters or fewer.`);
  }
  return trimmed;
}

/** The currently active session — what F2 apply-fix and Analyze codebase
 * target. Kept as the primary lookup other modules already depend on. */
async function getConnection() {
  const { rows } = await query(
    "SELECT id, name, owner, repo, branch, yaml_path FROM repo_sessions WHERE is_active LIMIT 1"
  );
  if (rows[0]) return rows[0];

  if (!process.env.PATIENT_REPO) return null;
  const [owner, repo] = process.env.PATIENT_REPO.split("/");
  return {
    id: null,
    name: repo,
    owner,
    repo,
    branch: process.env.PATIENT_REPO_BRANCH || "main",
    yaml_path: process.env.PATIENT_REPO_YAML_PATH || "zerops.yaml",
  };
}

async function listSessions() {
  const { rows } = await query(
    "SELECT id, name, owner, repo, branch, yaml_path, username, is_active, created_at FROM repo_sessions ORDER BY created_at DESC"
  );
  return rows;
}

/** Creates a session and makes it the active one — matches the expected
 * "switch to what I just connected" flow. */
async function createSession({ name, owner, repo, branch, yaml_path, username }) {
  const validName = validateName(name);
  const id = nanoid();
  return withTransaction(async (client) => {
    await client.query("UPDATE repo_sessions SET is_active = false WHERE is_active");
    const { rows } = await client.query(
      `INSERT INTO repo_sessions (id, name, owner, repo, branch, yaml_path, username, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true)
       RETURNING id, name, owner, repo, branch, yaml_path, username, is_active, created_at`,
      [id, validName, owner, repo, branch || "main", yaml_path || "zerops.yaml", username || null]
    );
    return rows[0];
  });
}

async function activateSession(id) {
  return withTransaction(async (client) => {
    await client.query("UPDATE repo_sessions SET is_active = false WHERE is_active");
    const { rows } = await client.query(
      `UPDATE repo_sessions SET is_active = true WHERE id = $1
       RETURNING id, name, owner, repo, branch, yaml_path, username, is_active, created_at`,
      [id]
    );
    if (!rows[0]) throw new Error("Session not found.");
    return rows[0];
  });
}

async function renameSession(id, name) {
  const validName = validateName(name);
  const { rows } = await query(
    `UPDATE repo_sessions SET name = $2 WHERE id = $1
     RETURNING id, name, owner, repo, branch, yaml_path, username, is_active, created_at`,
    [id, validName]
  );
  if (!rows[0]) throw new Error("Session not found.");
  return rows[0];
}

async function deleteSession(id) {
  const { rowCount } = await query("DELETE FROM repo_sessions WHERE id = $1", [id]);
  if (!rowCount) throw new Error("Session not found.");
}

module.exports = {
  getConnection,
  listSessions,
  createSession,
  activateSession,
  renameSession,
  deleteSession,
};
