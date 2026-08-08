// GET /api/replay/:id — public, read-only replay data for the shareable page (F6). No auth.
const express = require("express");
const replays = require("../lib/replays");

const router = express.Router();

// GET /api/replay?username=X — recent diagnoses for a signed-in username,
// so the dashboard can restore state on refresh instead of losing it the
// moment the in-memory replay_id from the last diagnose() call is gone.
router.get("/", async (req, res) => {
  const { username } = req.query;
  if (!username) return res.status(400).json({ error: "username is required." });
  const limit = Math.min(Number(req.query.limit) || 10, 50);
  const recent = await replays.getRecentByUsername(username, limit);
  res.json({ replays: recent });
});

router.get("/:id", async (req, res) => {
  const replay = await replays.getReplay(req.params.id);
  if (!replay) return res.status(404).json({ error: "Replay not found." });

  const events = await replays.getEvents(req.params.id);
  res.json({ ...replay, events });
});

module.exports = router;
