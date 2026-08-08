// Shared core of F1 (rules engine -> the LLM (Call A)) used by both the manual
// POST /api/diagnose route and the automatic F8 watch-mode trigger, so the
// two entry points can never drift into different diagnosis logic.
const rulesEngine = require("./rulesEngine");
const llm = require("./llm");
const github = require("./github");
const replays = require("./replays");
const repoConnection = require("./repoConnection");

const ANALYZE_CODEBASE_PROMPT =
  "No specific error was reported. Review the source files below for the most likely bug, " +
  "misconfiguration, or runtime failure risk, and report the single most significant issue you find.";

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
async function runDiagnosis({ yaml, log, text, repoUrl, useConnectedRepo, existingReplayId, titleHint }) {
  let routerResult = null;
  if (text && llm.isConfigured()) {
    try {
      routerResult = await llm.routeFreeText(text);
    } catch {
      routerResult = null;
    }
  }

  let sourceFiles = "";
  let connection = null;
  if (useConnectedRepo) {
    connection = await repoConnection.getConnection();
    if (!connection) {
      throw new Error("No repo connected — connect one in the dashboard first.");
    }
    try {
      sourceFiles = await github.fetchRelevantSourcesForRepo(
        connection.owner,
        connection.repo,
        connection.branch
      );
    } catch (err) {
      sourceFiles = `(could not fetch source: ${err.message})`;
    }
  } else if (repoUrl) {
    try {
      sourceFiles = await github.fetchRelevantSources(repoUrl);
    } catch (err) {
      sourceFiles = `(could not fetch source: ${err.message})`;
    }
  }

  // "Analyze codebase" has no pasted error to go on — give the LLM an
  // explicit instruction instead of an empty errorLog so it knows to scan
  // rather than explain a specific failure that doesn't exist.
  const effectiveLog = log || (useConnectedRepo && !text ? ANALYZE_CODEBASE_PROMPT : "");

  const { pattern, hint } = await rulesEngine.matchFailurePattern(yaml, log);
  if (pattern) await rulesEngine.recordSeen(pattern.id);
  const failedFixes = pattern ? await rulesEngine.getFailedFixes(pattern.id) : [];
  const attemptHistory = await buildAttemptHistory(existingReplayId, log);

  let diagnosis;
  if (llm.isConfigured()) {
    try {
      diagnosis = await llm.diagnose({
        yamlContent: yaml,
        errorLog: effectiveLog || (routerResult ? `(user description) ${text}` : ""),
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
