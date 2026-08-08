// F8 Watch Mode — persisted on/off state, a real server-side background
// job (watchScheduler.js) doing runtime-log error detection, and in-app
// notifications carrying the full diagnosis so a notification can be
// reviewed and applied directly, not just linked out to a read-only page.
const crypto = require("crypto");
const { query, pool } = require("../db");
const zerops = require("./zerops");
const repoConnection = require("./repoConnection");
const { runDiagnosis } = require("./diagnosisPipeline");

// Deliberately broad — this scans raw runtime log output (stdout/stderr),
// not a structured error field, so it has to catch stack traces, uncaught
// exceptions, and 5xx responses in access-log-style lines alike. False
// positives just cost one extra diagnosis call; false negatives mean a
// real failure goes unnoticed, which is the worse failure mode here.
const ERROR_RE =
  /(error|exception|traceback|cannot\s|undefined is not|typeerror|referenceerror|uncaught|panic:|fatal:|\b5\d\d\b)/i;

async function getState() {
  const { rows } = await query(
    "SELECT enabled, last_signature, updated_at FROM watch_state WHERE id = 1"
  );
  return rows[0] || { enabled: false, last_signature: null, updated_at: null };
}

async function setEnabled(enabled) {
  await query(
    `INSERT INTO watch_state (id, enabled, updated_at) VALUES (1, $1, now())
     ON CONFLICT (id) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now()`,
    [enabled]
  );
}

// Hashes just the tail so a slow-scrolling log window still reads as
// "the same content" between polls when nothing new has happened, and as
// "new" the moment fresh lines are appended.
function tailSignature(logText, lines = 8) {
  const tail = (logText || "").trim().split("\n").slice(-lines).join("\n");
  return crypto.createHash("sha1").update(tail).digest("hex");
}

// Reads the previous signature and writes the new one inside one locked
// transaction — now that a background job ticks independently of any
// client request, two checks landing close together (a slow poll overlap,
// or a future second replica) must not both see the same "old" value and
// both fire a diagnosis for the same error. SELECT ... FOR UPDATE blocks
// a concurrent caller until the first has committed its new signature, so
// the second correctly sees the first's write as "already handled."
async function swapSignature(newSignature) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT last_signature FROM watch_state WHERE id = 1 FOR UPDATE");
    const previous = rows[0]?.last_signature ?? null;
    await client.query("UPDATE watch_state SET last_signature = $1, updated_at = now() WHERE id = 1", [
      newSignature,
    ]);
    await client.query("COMMIT");
    return previous;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function createNotification(replayId, cause, errorType, diagnosis) {
  await query(
    `INSERT INTO watch_notifications (replay_id, cause, error_type, diagnosis_json)
     VALUES ($1, $2, $3, $4)`,
    [replayId, cause, errorType || null, diagnosis ? JSON.stringify(diagnosis) : null]
  );
}

async function listNotifications({ onlyUnseen = false, limit = 20 } = {}) {
  const { rows } = await query(
    `SELECT id, replay_id, cause, error_type, seen, created_at FROM watch_notifications
     ${onlyUnseen ? "WHERE seen = false" : ""}
     ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
  return rows;
}

/** Full record including the stored diagnosis — used when a notification
 * is clicked, so it can be loaded straight into the live dashboard panel
 * (fixed_yaml, code_suggestion, etc.) instead of only a read-only view. */
async function getNotification(id) {
  const { rows } = await query(
    "SELECT id, replay_id, cause, error_type, seen, created_at, diagnosis_json FROM watch_notifications WHERE id = $1",
    [id]
  );
  if (!rows[0]) return null;
  return { ...rows[0], diagnosis: rows[0].diagnosis_json };
}

async function markSeen(id) {
  await query("UPDATE watch_notifications SET seen = true WHERE id = $1", [id]);
}

async function markAllSeen() {
  await query("UPDATE watch_notifications SET seen = true WHERE seen = false");
}

/**
 * Fetches the patient service's runtime log, and if the tail has changed
 * since the last check AND looks like an error, runs a full diagnosis
 * (grounded in the active session's source when one exists, so the LLM
 * can attribute the error to a real file/line, not just describe it) and
 * records an in-app notification carrying that full diagnosis. Returns
 * the diagnosis, or null if nothing new/error-shaped was found. Called by
 * watchScheduler.js's background timer — safe to also call from a request
 * handler (the signature swap is what makes overlap safe, not caller
 * discipline).
 */
async function checkForNewError(serviceId) {
  const log = await zerops.getDeployLogs(serviceId);
  const signature = tailSignature(log);
  const previous = await swapSignature(signature);

  const isNewTail = signature !== previous;
  if (!isNewTail || !ERROR_RE.test(log)) return null;

  const connection = await repoConnection.getConnection().catch(() => null);
  const diagnosis = await runDiagnosis({
    log,
    useConnectedRepo: Boolean(connection),
    titleHint: "Caught automatically by Watch Mode",
  });

  await createNotification(diagnosis.replay_id, diagnosis.cause, diagnosis.error_type, diagnosis);
  return diagnosis;
}

module.exports = {
  getState,
  setEnabled,
  checkForNewError,
  listNotifications,
  getNotification,
  markSeen,
  markAllSeen,
};
