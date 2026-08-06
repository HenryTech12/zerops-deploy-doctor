// Shared core of F1 (rules engine -> the LLM (Call A)) used by both the manual
// POST /api/diagnose route and the automatic F8 watch-mode trigger, so the
// two entry points can never drift into different diagnosis logic.
const rulesEngine = require("./rulesEngine");
const llm = require("./llm");
const github = require("./github");
const replays = require("./replays");

async function buildAttemptHistory(replayId, latestLog) {
  if (!replayId) return [];
  const events = await replays.getEvents(replayId);
  const fixEvents = events.filter((e) => e.fix_summary && e.status !== "pending");
  return fixEvents.map((e, i) => ({
    fix_summary: e.fix_summary,
    resulting_log: i === fixEvents.length - 1 ? latestLog : undefined,
  }));
}

function fallbackDiagnosis(pattern, hint, reason) {
  if (pattern) {
    return {
      error_type: "config",
      cause: pattern.title,
      explanation: `Rules-engine match (LLM unavailable: ${reason}). ${pattern.title}.`,
      suggested_fix: pattern.canonical_fix,
      fixed_yaml: null,
      file_path: null,
      code_suggestion: null,
      next_time_tip: pattern.canonical_fix,
      difficulty: pattern.difficulty || "Beginner",
    };
  }
  return {
    error_type: "config",
    cause: hint || "Unrecognized failure",
    explanation: `No rules-engine match and the LLM is unavailable (${reason}). Paste more of the error log for a better match.`,
    suggested_fix: hint || "Review the error log manually against the zerops.yaml reference.",
    fixed_yaml: null,
    file_path: null,
    code_suggestion: null,
    next_time_tip: "Keep zerops.yaml and logs handy — DeployDoctor pattern-matches on both.",
    difficulty: "Beginner",
  };
}

/**
 * Runs rules engine + the LLM (Call A), records seen/failed-fix stats, appends a
 * "fail" timeline event, and returns the diagnosis JSON + replay/attempt ids.
 * Used for both explicit user submissions and F8's automatic trigger.
 */
async function runDiagnosis({ yaml, log, text, repoUrl, existingReplayId, titleHint }) {
  let routerResult = null;
  if (text && llm.isConfigured()) {
    try {
      routerResult = await llm.routeFreeText(text);
    } catch {
      routerResult = null;
    }
  }

  let sourceFiles = "";
  if (repoUrl) {
    try {
      sourceFiles = await github.fetchRelevantSources(repoUrl);
    } catch (err) {
      sourceFiles = `(could not fetch source: ${err.message})`;
    }
  }

  const { pattern, hint } = await rulesEngine.matchFailurePattern(yaml, log);
  if (pattern) await rulesEngine.recordSeen(pattern.id);
  const failedFixes = pattern ? await rulesEngine.getFailedFixes(pattern.id) : [];
  const attemptHistory = await buildAttemptHistory(existingReplayId, log);

  let diagnosis;
  if (llm.isConfigured()) {
    try {
      diagnosis = await llm.diagnose({
        yamlContent: yaml,
        errorLog: log || (routerResult ? `(user description) ${text}` : ""),
        sourceFiles,
        matchedPattern: pattern,
        attemptHistory,
        failedFixes,
      });
    } catch (err) {
      diagnosis = fallbackDiagnosis(pattern, hint, err.message);
    }
  } else {
    diagnosis = fallbackDiagnosis(pattern, hint, "GROQ_API_KEY not configured");
  }

  let patternId = pattern?.id || null;
  if (!patternId && diagnosis.error_type === "code" && diagnosis.cause) {
    const created = await rulesEngine.findOrCreateCodePattern(
      diagnosis.cause.slice(0, 200),
      diagnosis.suggested_fix || diagnosis.code_suggestion || "(no canonical fix recorded yet)",
      diagnosis.difficulty
    );
    patternId = created.id;
    await rulesEngine.recordSeen(patternId);
  }

  const replayId =
    existingReplayId || (await replays.createReplay(titleHint || diagnosis.cause?.slice(0, 80)));
  const attemptN = await replays.nextAttemptNumber(replayId);
  await replays.appendEvent(replayId, {
    attemptN,
    status: "fail",
    errorType: diagnosis.error_type,
    cause: diagnosis.cause,
    fixSummary: diagnosis.suggested_fix,
    patternId,
  });

  return { ...diagnosis, pattern_id: patternId, replay_id: replayId, attempt_n: attemptN };
}

module.exports = { runDiagnosis };
