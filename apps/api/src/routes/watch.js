// F8 Watch Mode — persisted toggle, runtime-log error detection (not just
// deploy-status flips, which miss an app that's "running" per Zerops but
// throwing errors on real requests), and in-app notifications. Polling
// itself is still driven by the frontend while the page is open (see
// watchMode.js for the "why no background worker" note).
const express = require("express");
const zerops = require("../lib/zerops");
const watchMode = require("../lib/watchMode");

const router = express.Router();

router.get("/state", async (req, res) => {
  const state = await watchMode.getState();
  res.json({ enabled: state.enabled });
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

router.post("/notifications/:id/seen", async (req, res) => {
  await watchMode.markSeen(req.params.id);
  res.json({ ok: true });
});

router.post("/notifications/seen-all", async (req, res) => {
  await watchMode.markAllSeen();
  res.json({ ok: true });
});

router.get("/status", async (req, res) => {
  const state = await watchMode.getState();
  if (!state.enabled) {
    return res.json({ watching: false });
  }
  if (!zerops.isConfigured()) {
    return res.json({ watching: false, note: "API_TOKEN not configured" });
  }

  try {
    const diagnosis = await watchMode.checkForNewError(process.env.PATIENT_SERVICE_ID);
    if (diagnosis) {
      return res.json({ watching: true, triggered: true, diagnosis });
    }
    res.json({ watching: true, triggered: false });
  } catch (err) {
    console.error("watch status error:", err);
    res.status(500).json({ error: "Watch status check failed", detail: err.message });
  }
});

module.exports = router;
