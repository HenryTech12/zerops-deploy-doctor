// Shared core of F1 (rules engine -> the LLM (Call A)) used by both the manual
// POST /api/diagnose route and the automatic F8 watch-mode trigger, so the
// two entry points can never drift into different diagnosis logic.
const rulesEngine = require("./rulesEngine");
const llm = require("./llm");
const github = require("./github");
const replays = require("./replays");
const repoConnection = require("./repoConnection");
const zerops = require("./zerops");

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
      // A known rules-engine pattern is a real signature match, not a
      // guess — but still capped below "high" since there's no LLM
      // cross-check confirming it fits this specific log.
      confidence: 65,
      confidence_reason: "Matched a known rules-engine pattern; the LLM was unavailable to cross-check it.",
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
    confidence: 10,
    confidence_reason: "No rules-engine match and no LLM available — this is barely more than a guess.",
    next_time_tip: "Keep zerops.yaml and logs handy — DeployDoctor pattern-matches on both.",
    difficulty: "Beginner",
  };
}

/**
 * Runs rules engine + the LLM (Call A), records seen/failed-fix stats, appends a
 * "fail" timeline event, and returns the diagnosis JSON + replay/attempt ids.
 * Used for both explicit user submissions and F8's automatic trigger.
 */
async function runDiagnosis({
  yaml,
  log,
  text,
  repoUrl,
  useConnectedRepo,
  filePaths,
  existingReplayId,
  titleHint,
  username,
}) {
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
  let effectiveYaml = yaml;
  if (useConnectedRepo) {
    connection = await repoConnection.getConnection();
    if (!connection) {
      throw new Error("No repo connected — connect one in the dashboard first.");
    }
    try {
      // An explicit file selection (from the "Analyze codebase" picker)
      // overrides the entrypoint-name heuristic — the user knows exactly
      // which files they want reviewed.
      sourceFiles =
        filePaths && filePaths.length
          ? await github.fetchSourcesForFiles(connection.owner, connection.repo, connection.branch, filePaths)
          : await github.fetchRelevantSourcesForRepo(connection.owner, connection.repo, connection.branch);
    } catch (err) {
      sourceFiles = `(could not fetch source: ${err.message})`;
    }

    // "Analyze codebase" never asks the user to paste zerops.yaml, but a
    // config-type diagnosis still needs the REAL one to edit — without
    // this, the LLM has nothing to anchor "fixed_yaml" on and will
    // invent a plausible-looking but wrong schema from scratch (confirmed
    // live: it fabricated a `services: web: ...` shape instead of
    // Zerops's actual `zerops: - setup: ...`, and that got committed
    // verbatim, breaking the repo's real deploy pipeline).
    if (!effectiveYaml) {
      try {
        effectiveYaml = await github.getFileContent(
          connection.owner,
          connection.repo,
          connection.yaml_path,
          connection.branch
        );
      } catch {
        // no yaml at that path, or fetch failed — leave undefined; the
        // system prompt is instructed to never fabricate a config fix
        // when yamlContent is "(none provided)".
      }
    }
  } else if (repoUrl) {
    try {
      sourceFiles = await github.fetchRelevantSources(repoUrl);
    } catch (err) {
      sourceFiles = `(could not fetch source: ${err.message})`;
    }
  }

  // No pasted log to go on — rather than dead-ending on "no error details
  // provided" (confirmed live: that's exactly what a plain-English or
  // yaml-only submission produced), pull the patient service's actual
  // recent runtime log, the same source Watch Mode's background job
  // already reads. The platform doesn't expose an explicit time-range
  // filter, so "recent" (Zerops's own log window) is the proxy for
  // "around when this is being diagnosed" — good enough since the user is
  // diagnosing right now, not investigating a historical incident.
  let effectiveLog = log;
  if (!effectiveLog && zerops.isConfigured() && process.env.PATIENT_SERVICE_ID) {
    try {
      const runtimeLog = await zerops.getDeployLogs(process.env.PATIENT_SERVICE_ID);
      if (runtimeLog && runtimeLog.trim()) effectiveLog = runtimeLog;
    } catch {
      // Zerops fetch failed (token/service not configured, transient
      // error) — fall through to the next fallback instead of failing
      // the whole diagnosis over a missing nice-to-have.
    }
  }
  // Still nothing (Zerops not configured, or its log came back empty) —
  // "Analyze codebase" at least gives the LLM an explicit instruction
  // instead of silently diagnosing off nothing.
  if (!effectiveLog && useConnectedRepo && !text) {
    effectiveLog = ANALYZE_CODEBASE_PROMPT;
  }

  const { pattern, hint } = await rulesEngine.matchFailurePattern(effectiveYaml, effectiveLog);
  if (pattern) await rulesEngine.recordSeen(pattern.id);
  const failedFixes = pattern ? await rulesEngine.getFailedFixes(pattern.id) : [];
  const attemptHistory = await buildAttemptHistory(existingReplayId, effectiveLog);

  let diagnosis;
  if (llm.isConfigured()) {
    try {
      diagnosis = await llm.diagnose({
        yamlContent: effectiveYaml,
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

  // A code fix can only be safely committed (as opposed to copy-paste
  // only) if we can diff it against the file's real current content —
  // and that's also the check that catches the LLM returning a snippet
  // instead of the full file it was instructed to when source was
  // available (see llm.js): if code_suggestion turns out much shorter
  // than the real file, it's not a safe whole-file replacement, and
  // original_file_content simply won't be attached, so the UI falls back
  // to copy-paste. Only reachable via a connected session — the
  // read-only public repoUrl path never gets commit capability.
  if (diagnosis.error_type === "code" && diagnosis.file_path && diagnosis.code_suggestion && connection) {
    try {
      diagnosis.original_file_content = await github.getFileContent(
        connection.owner,
        connection.repo,
        diagnosis.file_path,
        connection.branch
      );
    } catch {
      // File doesn't exist at that exact path (LLM guessed slightly
      // wrong), or fetch failed — leave undefined, copy-paste-only.
    }
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
    existingReplayId ||
    (await replays.createReplay(titleHint || diagnosis.cause?.slice(0, 80), username));
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
