// GET /api/watch/status — F8. Polled by the frontend's Watch toggle every ~30s
// while the page is open. Edge-triggered: only fires a fresh diagnosis the
// moment the service transitions INTO a failed state, not on every poll while
// it stays failed. Page-open polling only — no background jobs/webhooks (v2).
const express = require("express");
const zerops = require("../lib/zerops");
const { runDiagnosis } = require("../lib/diagnosisPipeline");

const router = express.Router();

// In-memory, single-instance state is enough for a page-open watch loop —
// intentionally not persisted (see doc §F8 scope guard).
const lastKnownStatus = new Map();

router.get("/status", async (req, res) => {
  if (!zerops.isConfigured()) {
    return res.json({ watching: false, note: "API_TOKEN not configured" });
  }

  const serviceId = process.env.PATIENT_SERVICE_ID;
  try {
    const raw = await zerops.getServiceStatus(serviceId);
    const normalized = zerops.normalizeStatus(raw?.status);
    const previous = lastKnownStatus.get(serviceId) || "unknown";
    lastKnownStatus.set(serviceId, normalized);

    const justFailed = normalized === "fail" && previous !== "fail";
    if (!justFailed) {
      return res.json({ watching: true, status: normalized, triggered: false });
    }

    const log = await zerops.getDeployLogs(serviceId).catch(() => "");
    const diagnosis = await runDiagnosis({
      yaml: null,
      log,
      titleHint: "Caught automatically by Watch Mode",
    });

    res.json({ watching: true, status: normalized, triggered: true, diagnosis });
  } catch (err) {
    console.error("watch status error:", err);
    res.status(500).json({ error: "Watch status check failed", detail: err.message });
  }
});

module.exports = router;
