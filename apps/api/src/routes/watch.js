// F8 Watch Mode — the actual runtime-log check runs on a real server-side
// timer (see watchScheduler.js), independent of any open browser tab.
// These routes are just the toggle and the in-app notification list.
const express = require("express");
const watchMode = require("../lib/watchMode");

const router = express.Router();

router.get("/state", async (req, res) => {
  const state = await watchMode.getState();
  res.json({ enabled: state.enabled, last_checked: state.updated_at });
});

router.post("/enable", async (req, res) => {
  await watchMode.setEnabled(true);
  res.json({ enabled: true });
});

router.post("/disable", async (req, res) => {
  await watchMode.setEnabled(false);
  res.json({ enabled: false });
});

router.get("/notifications", async (req, res) => {
  const notifications = await watchMode.listNotifications({ onlyUnseen: req.query.unseen === "true" });
  res.json({ notifications });
});

// Full record including the stored diagnosis — used when a notification
// is clicked, to hydrate the live dashboard panel (fixed_yaml,
// code_suggestion, etc.) so the fix can actually be reviewed and applied
// from here, not just linked out to a read-only page.
router.get("/notifications/:id", async (req, res) => {
  const notification = await watchMode.getNotification(req.params.id);
  if (!notification) return res.status(404).json({ error: "Notification not found." });
  res.json({ notification });
});

router.post("/notifications/:id/seen", async (req, res) => {
  await watchMode.markSeen(req.params.id);
  res.json({ ok: true });
});

router.post("/notifications/seen-all", async (req, res) => {
  await watchMode.markAllSeen();
  res.json({ ok: true });
});

module.exports = router;
