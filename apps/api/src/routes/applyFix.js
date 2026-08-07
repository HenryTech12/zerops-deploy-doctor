// POST /api/apply-fix — {replay_id, fixed_yaml} -> commit the fix to the
// patient repo, letting Zerops's own push-to-branch pipeline trigger
// redeploy it. Config errors only. Nothing here runs without this explicit
// call, which the frontend only sends on an explicit user click on the diff
// viewer (F2 human-in-the-loop).
const express = require("express");
const github = require("../lib/github");
const replays = require("../lib/replays");

const router = express.Router();

router.post("/", async (req, res) => {
  const { replay_id, fixed_yaml, pattern_id } = req.body || {};
  if (!replay_id || !fixed_yaml) {
    return res.status(400).json({ error: "replay_id and fixed_yaml are required." });
  }

  const replay = await replays.getReplay(replay_id);
  if (!replay) return res.status(404).json({ error: "Unknown replay_id." });

  try {
    if (!github.isWriteConfigured() || !process.env.PATIENT_REPO) {
      return res.status(503).json({
        error:
          "PATIENT_REPO_TOKEN or PATIENT_REPO not configured — cannot apply the fix in this environment.",
      });
    }

    const [owner, repo] = process.env.PATIENT_REPO.split("/");
    const branch = process.env.PATIENT_REPO_BRANCH || "main";
    const path = process.env.PATIENT_REPO_YAML_PATH || "zerops.yaml";

    await github.commitFile({
      owner,
      repo,
      branch,
      path,
      content: fixed_yaml,
      message: `DeployDoctor: apply fix for replay ${replay_id}`,
    });

    // Reuses the current attempt's number — apply-fix is a state transition
    // (diagnosed -> pending) within the same diagnose/fix/redeploy cycle, not
    // a new one. A new attempt_n is only minted by a fresh diagnosis.
    const existingEvents = await replays.getEvents(replay_id);
    const attemptN = existingEvents.length
      ? existingEvents[existingEvents.length - 1].attempt_n
      : await replays.nextAttemptNumber(replay_id);
    const event = await replays.appendEvent(replay_id, {
      attemptN,
      status: "pending",
      errorType: "config",
      cause: "Fix committed to the repo, redeploy pipeline should pick it up",
      fixSummary: "Applied fixed zerops.yaml, awaiting deploy result",
      patternId: pattern_id || null,
    });

    res.json({ ok: true, replay_id, attempt_n: attemptN, event, applied_at: Date.now() });
  } catch (err) {
    console.error("apply-fix error:", err);
    res.status(500).json({ error: "Failed to apply fix", detail: err.message });
  }
});

module.exports = router;
