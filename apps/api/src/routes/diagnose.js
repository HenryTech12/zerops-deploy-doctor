// POST /api/diagnose — {yaml?, log?, text?, repo_url?, replay_id?} -> diagnosis JSON + replay_id
// F1 (diagnosis) + F3 (NL routing, folded into the pipeline) + F7 (repo fetch, folded in).
const express = require("express");
const { runDiagnosis } = require("../lib/diagnosisPipeline");

const router = express.Router();

router.post("/", async (req, res) => {
  const { yaml, log, text, repo_url, use_connected_repo, file_paths, replay_id, username } =
    req.body || {};

  if (!yaml && !log && !text && !use_connected_repo) {
    return res.status(400).json({ error: "Provide at least one of yaml, log, or text." });
  }

  try {
    const result = await runDiagnosis({
      yaml,
      log,
      text,
      repoUrl: repo_url,
      useConnectedRepo: Boolean(use_connected_repo),
      filePaths: Array.isArray(file_paths) ? file_paths : undefined,
      existingReplayId: replay_id,
      username,
    });
    res.json(result);
  } catch (err) {
    console.error("diagnose error:", err);
    res.status(500).json({ error: "Diagnosis failed", detail: err.message });
  }
});

module.exports = router;
