// Shared helpers for the replay timeline (F6) — every diagnose/apply-fix/status
// cycle appends an event here regardless of which route triggered it.
const { customAlphabet } = require("nanoid");
const { query } = require("../db");

const nanoid = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 8);

async function createReplay(title, username) {
  const id = nanoid();
  await query("INSERT INTO replays (id, title, username) VALUES ($1, $2, $3)", [
    id,
    title || null,
    username || null,
  ]);
  return id;
}

async function getReplay(id) {
  const { rows } = await query("SELECT * FROM replays WHERE id = $1", [id]);
  return rows[0] || null;
}

/** Most recent replays for a signed-in username, each with its latest status —
 * powers the dashboard's "Recent diagnoses" list and restores state on refresh. */
async function getRecentByUsername(username, limit = 10) {
  const { rows } = await query(
    `SELECT r.id, r.title, r.created_at,
       (SELECT e.status FROM replay_events e WHERE e.replay_id = r.id ORDER BY e.attempt_n DESC, e.id DESC LIMIT 1) AS latest_status
     FROM replays r
     WHERE r.username = $1
     ORDER BY r.created_at DESC
     LIMIT $2`,
    [username, limit]
  );
  return rows;
}

async function nextAttemptNumber(replayId) {
  const { rows } = await query(
    "SELECT COALESCE(MAX(attempt_n), 0) + 1 AS n FROM replay_events WHERE replay_id = $1",
    [replayId]
  );
  return rows[0].n;
}

async function appendEvent(replayId, { attemptN, status, errorType, cause, fixSummary, patternId }) {
  const { rows } = await query(
    `INSERT INTO replay_events (replay_id, attempt_n, status, error_type, cause, fix_summary, pattern_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [replayId, attemptN, status, errorType || null, cause || null, fixSummary || null, patternId || null]
  );
  return rows[0];
}

async function getEvents(replayId) {
  const { rows } = await query(
    "SELECT * FROM replay_events WHERE replay_id = $1 ORDER BY attempt_n ASC, id ASC",
    [replayId]
  );
  return rows;
}

module.exports = {
  createReplay,
  getReplay,
  getRecentByUsername,
  nextAttemptNumber,
  appendEvent,
  getEvents,
};
