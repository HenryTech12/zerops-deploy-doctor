// POST /api/apply-code-fix — {replay_id, file_path, code_suggestion} ->
// commit a code fix straight to the connected repo, same push-to-branch
// pattern as F2's config apply-fix. This is the one deliberate exception
// to "DeployDoctor never writes to your application code": it's still an
// explicit, human-reviewed click (the diff + confidence score are shown
// first), and it's only offered at all when the diagnosis pipeline could
// fetch the file's real current content to safely diff against — see
// diagnosisPipeline.js's original_file_content comment.
const express = require("express");
const github = require("../lib/github");
const replays = require("../lib/replays");
const repoConnection = require("../lib/repoConnection");

const router = express.Router();

// The LLM is instructed to return the complete file, not a snippet, when
// it can see the file's current content — but instruction-following isn't
// guaranteed. Re-fetching the CURRENT content server-side (never trusting
// whatever "original" the client sends) and refusing anything that looks
// like a drastic truncation is the actual safety net: it's what stops a
// snippet from silently overwriting the rest of a real file.
const MIN_LENGTH_RATIO = 0.4;
const MIN_MEANINGFUL_LENGTH = 200;

router.post("/", async (req, res) => {
  const { replay_id, file_path, code_suggestion, pattern_id } = req.body || {};
  if (!replay_id || !file_path || !code_suggestion || !code_suggestion.trim()) {
    return res.status(400).json({ error: "replay_id, file_path, and code_suggestion are required." });
  }

  const replay = await replays.getReplay(replay_id);
  if (!replay) return res.status(404).json({ error: "Unknown replay_id." });

  try {
    const connection = github.isWriteConfigured() ? await repoConnection.getConnection() : null;
    if (!connection) {
      return res.status(503).json({
        error: "No repo connected — connect a repo in the DeployDoctor UI before applying a fix.",
      });
    }

    const { owner, repo, branch } = connection;

    let currentContent;
    try {
      currentContent = await github.getFileContent(owner, repo, file_path, branch);
    } catch (err) {
      return res.status(422).json({
        error: `Couldn't read ${file_path} from the repo to safely diff against — refusing to commit blind`,
        detail: err.message,
      });
    }

    if (
      currentContent.length > MIN_MEANINGFUL_LENGTH &&
      code_suggestion.length < currentContent.length * MIN_LENGTH_RATIO
    ) {
      return res.status(422).json({
        error: `Refusing to commit — the suggested fix (${code_suggestion.length} chars) is far shorter than ${file_path}'s current content (${currentContent.length} chars), which looks like a snippet rather than a full-file replacement. Copy-paste it manually instead.`,
      });
    }

    await github.commitFile({
      owner,
      repo,
      branch,
      path: file_path,
      content: code_suggestion,
      message: `DeployDoctor: apply code fix for replay ${replay_id}`,
    });

    // Reuses the current attempt's number — apply-code-fix is a state
    // transition (diagnosed -> pending) within the same cycle, not a new
    // one. A new attempt_n is only minted by a fresh diagnosis.
    const existingEvents = await replays.getEvents(replay_id);
    const attemptN = existingEvents.length
      ? existingEvents[existingEvents.length - 1].attempt_n
      : await replays.nextAttemptNumber(replay_id);
    const event = await replays.appendEvent(replay_id, {
      attemptN,
      status: "pending",
      errorType: "code",
      cause: `Code fix committed to ${file_path}, redeploy pipeline should pick it up`,
      fixSummary: `Applied fix to ${file_path}, awaiting deploy result`,
      patternId: pattern_id || null,
    });

    res.json({ ok: true, replay_id, attempt_n: attemptN, event, applied_at: Date.now() });
  } catch (err) {
    console.error("apply-code-fix error:", err);
    res.status(500).json({ error: "Failed to apply code fix", detail: err.message });
  }
});

module.exports = router;
