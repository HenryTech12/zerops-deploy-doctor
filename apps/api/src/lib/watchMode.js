// F8 Watch Mode — persisted on/off state, runtime-log error detection, and
// in-app notifications. Still page-open polling (the browser drives the
// interval; there's no server-side background worker — see README
// roadmap), but the toggle and any caught issues now survive a refresh
// instead of living only in React state.
const crypto = require("crypto");
const { query } = require("../db");
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
  const { rows } = await query("SELECT enabled, last_signature FROM watch_state WHERE id = 1");
  return rows[0] || { enabled: false, last_signature: null };
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

async function createNotification(replayId, cause, errorType) {
  await query("INSERT INTO watch_notifications (replay_id, cause, error_type) VALUES ($1, $2, $3)", [
    replayId,
    cause,
    errorType || null,
  ]);
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
 * records an in-app notification. Returns the diagnosis, or null if
 * nothing new/error-shaped was found.
 */
async function checkForNewError(serviceId) {
  const log = await zerops.getDeployLogs(serviceId);
  const signature = tailSignature(log);
  const state = await getState();

  // Always advance the signature, whether or not this check matched —
  // otherwise an already-seen error sitting in the log window would
  // re-trigger a fresh diagnosis (and notification) every single poll.
  await query("UPDATE watch_state SET last_signature = $1, updated_at = now() WHERE id = 1", [
    signature,
  ]);

  const isNewTail = signature !== state.last_signature;
  if (!isNewTail || !ERROR_RE.test(log)) return null;

  const connection = await repoConnection.getConnection().catch(() => null);
  const diagnosis = await runDiagnosis({
    log,
    useConnectedRepo: Boolean(connection),
    titleHint: "Caught automatically by Watch Mode",
  });

  await createNotification(diagnosis.replay_id, diagnosis.cause, diagnosis.error_type);
  return diagnosis;
}

module.exports = {
  getState,
  setEnabled,
  checkForNewError,
  listNotifications,
  markSeen,
  markAllSeen,
};
