// GET /api/status/:replay_id — poll deploy status; appends timeline events on
// state change; F8's watch-mode poller and the frontend's post-apply poller
// both hit this on an interval. Drives the F2 auto-retry loop (max 3 attempts).
const express = require("express");
const zerops = require("../lib/zerops");
const replays = require("../lib/replays");
const rulesEngine = require("../lib/rulesEngine");

const router = express.Router();
const MAX_ATTEMPTS = 3;

router.get("/:replay_id", async (req, res) => {
  const { replay_id } = req.params;
  const replay = await replays.getReplay(replay_id);
  if (!replay) return res.status(404).json({ error: "Unknown replay_id." });

  const events = await replays.getEvents(replay_id);
  const latest = events[events.length - 1];

  // Nothing in flight — just return the timeline as-is (cheap, safe to poll).
  if (!latest || latest.status !== "pending") {
    return res.json({ replay_id, events, polled: false });
  }

  if (!zerops.isConfigured()) {
    return res.json({ replay_id, events, polled: false, note: "API_TOKEN not configured" });
  }

  try {
    const raw = await zerops.getServiceStatus(process.env.PATIENT_SERVICE_ID);
    const normalized = zerops.normalizeStatus(raw?.status);

    if (normalized === "pending") {
      return res.json({ replay_id, events, polled: true, unchanged: true });
    }

    if (normalized === "success") {
      const fixSeconds = (Date.now() - new Date(latest.created_at).getTime()) / 1000;
      if (latest.pattern_id) await rulesEngine.recordFixed(latest.pattern_id, fixSeconds);

      const event = await replays.appendEvent(replay_id, {
        attemptN: latest.attempt_n,
        status: "success",
        errorType: latest.error_type,
        cause: "Deploy succeeded",
        fixSummary: latest.fix_summary,
        patternId: latest.pattern_id,
      });
      return res.json({ replay_id, events: [...events, event], polled: true, resolved: "success" });
    }

    // normalized === "fail"
    const newLog = await zerops.getDeployLogs(process.env.PATIENT_SERVICE_ID).catch(() => "");
    if (latest.pattern_id) {
      await rulesEngine.recordFailedFix(latest.pattern_id, latest.fix_summary);
    }

    const stopped = latest.attempt_n >= MAX_ATTEMPTS;
    const event = await replays.appendEvent(replay_id, {
      attemptN: latest.attempt_n,
      status: "fail",
      errorType: latest.error_type,
      cause: stopped
        ? `Deploy still failing after ${MAX_ATTEMPTS} attempts — stopping automatic loop.`
        : "Deploy still failing after the applied fix",
      fixSummary: latest.fix_summary,
      patternId: latest.pattern_id,
    });

    return res.json({
      replay_id,
      events: [...events, event],
      polled: true,
      resolved: "fail",
      stopped,
      new_log: stopped ? undefined : newLog,
    });
  } catch (err) {
    console.error("status poll error:", err);
    res.status(500).json({ error: "Status poll failed", detail: err.message });
  }
});

module.exports = router;
