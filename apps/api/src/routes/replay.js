// GET /api/replay/:id — public, read-only replay data for the shareable page (F6). No auth.
const express = require("express");
const replays = require("../lib/replays");

const router = express.Router();

router.get("/:id", async (req, res) => {
  const replay = await replays.getReplay(req.params.id);
  if (!replay) return res.status(404).json({ error: "Replay not found." });

  const events = await replays.getEvents(req.params.id);
  res.json({ ...replay, events });
});

module.exports = router;
