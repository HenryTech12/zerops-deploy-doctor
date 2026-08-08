// Groq orchestration — Call A (diagnose+fix, F1/F2/F4/F7) and Call B (NL router, F3).
// gpt-oss-120b handles the hard call (diagnosis + fix generation); gpt-oss-20b
// handles the cheap one (NL routing is just classification) to conserve rate
// limit headroom on Groq's free tier. Both calls: strip ```json fences
// defensively, parse, retry once on bad JSON, then fall back to a
// rules-engine-only answer. See doc §8.
const Groq = require("groq-sdk");

const DIAGNOSE_MODEL = process.env.GROQ_DIAGNOSE_MODEL || "openai/gpt-oss-120b";
const ROUTER_MODEL = process.env.GROQ_ROUTER_MODEL || "openai/gpt-oss-20b";

let _client = null;
function client() {
  if (!process.env.GROQ_API_KEY) return null;
  if (!_client) _client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return _client;
}

function stripFences(text) {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

async function callGroqJSON({ model, system, user, maxTokens = 1500 }) {
  const groq = client();
  if (!groq) {
    throw new Error("GROQ_API_KEY not configured");
  }

  const ask = async (userText) => {
    const resp = await groq.chat.completions.create({
      model,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: userText },
      ],
    });
    return resp.choices[0]?.message?.content || "";
  };

  let raw = await ask(user);
  try {
    return JSON.parse(stripFences(raw));
  } catch {
    raw = await ask(
      `${user}\n\nYour last response was not valid JSON. Respond with only the JSON object.`
    );
    return JSON.parse(stripFences(raw));
  }
}

const DIAGNOSE_SYSTEM_PROMPT = `You are a Zerops deployment expert. Given a zerops.yaml file, an error log, and optionally relevant source files, identify the root cause and classify it: "config" (fixable by changing zerops.yaml) or "code" (a bug in the application source). Explain the root cause in plain English for a developer new to Zerops.

For config errors, produce a corrected zerops.yaml: return the complete file with the minimal necessary change, editing existing keys/list entries in place — never duplicate an existing list entry (e.g. a "ports" item) to add a field to it; add the field to the existing entry instead. CRITICAL: if the zerops.yaml provided is "(none provided)" or empty, you have no real file to edit — never invent one from scratch or guess at a schema. In that case set "fixed_yaml" to null and either classify as "code", or explain in "suggested_fix" what content is needed before a config fix can be generated. A real Zerops config always starts with a top-level "zerops:" key containing a list of service objects with "setup:" names — never emit any other schema (e.g. never invent a "services:" top-level key).

For code errors, identify the file and line. CRITICAL — code_suggestion has exactly two valid shapes, and which one you must use depends on whether that file's CURRENT content appears verbatim in the "Source files" section below: (1) if it does, code_suggestion MUST be that file's COMPLETE content with only the minimal necessary change applied — the same "whole file, minimal edit" rule as fixed_yaml, because this is committed directly to replace the file; never return a snippet or excerpt in this case, that would delete the rest of the file. (2) if that file's content is NOT in Source files (you're working from the error log/description alone), code_suggestion must be a short illustrative snippet or plain-English instructions instead, since you cannot safely reconstruct a whole file you haven't seen — never guess at surrounding code you don't have.

Every diagnosis also needs a "confidence" score (integer 0-100) for how sure you are the identified root cause and proposed fix are correct — calibrate honestly: high (80-100) only for an unambiguous root cause directly evidenced by the log/code (e.g. a stack trace pointing at the exact line, a clearly missing required field); medium (40-79) when the fix is a reasonable best guess but some ambiguity remains; low (0-39) when multiple root causes are plausible, business logic you don't have context on may be involved, or you're mostly guessing. Include a one-sentence "confidence_reason" explaining that score. This confidence score is shown to the user before they decide whether to commit a code fix directly — do not inflate it.

Also provide a one-sentence tip to avoid this next time, and rate the difficulty (Beginner/Intermediate/Advanced). Respond with JSON only, no markdown fences: {"error_type": "config"|"code", "cause": "...", "explanation": "...", "suggested_fix": "...", "fixed_yaml": "..."|null, "file_path": "..."|null, "code_suggestion": "..."|null, "confidence": <0-100 integer>, "confidence_reason": "...", "next_time_tip": "...", "difficulty": "..."}`;

/**
 * Call A — diagnose + fix.
 * @param {object} params
 * @param {string} params.yamlContent
 * @param {string} params.errorLog
 * @param {string} [params.sourceFiles]
 * @param {{title: string, canonical_fix: string}|null} [params.matchedPattern]
 * @param {Array<object>} [params.attemptHistory] previous {fix, log} attempts this session (F2 retry memory)
 * @param {string[]} [params.failedFixes] known-bad fixes for this pattern (F9)
 */
async function diagnose({
  yamlContent,
  errorLog,
  sourceFiles,
  matchedPattern,
  attemptHistory,
  failedFixes,
}) {
  const attemptHistoryText = (attemptHistory || [])
    .map(
      (a, i) =>
        `Attempt ${i + 1}: suggested fix — ${a.fix_summary}\nResulting log after that fix was applied:\n${a.resulting_log || "(no new log yet)"}`
    )
    .join("\n\n");

  const user = `zerops.yaml:
${yamlContent || "(none provided)"}

Error log:
${errorLog || "(none provided)"}

Source files (may be empty):
${sourceFiles || "(none provided)"}

Rules engine matched pattern (may be empty): ${
    matchedPattern ? `${matchedPattern.title}: ${matchedPattern.canonical_fix}` : "(no match)"
  }

Previous failed attempts in this session (may be empty): ${attemptHistoryText || "(none)"}

Known fixes that did NOT work for this pattern (may be empty): ${
    (failedFixes || []).join("; ") || "(none)"
  }`;

  return callGroqJSON({ model: DIAGNOSE_MODEL, system: DIAGNOSE_SYSTEM_PROMPT, user });
}

const ROUTER_SYSTEM_PROMPT = `You are a triage assistant for Zerops deployments. Given a user's free-text description of a problem, classify what should be checked. Respond with JSON only: {"check_type": "config" | "logs" | "status", "reasoning": "..."}`;

/** Call B — NL router (F3). */
async function routeFreeText(text) {
  return callGroqJSON({ model: ROUTER_MODEL, system: ROUTER_SYSTEM_PROMPT, user: text, maxTokens: 300 });
}

module.exports = { diagnose, routeFreeText, isConfigured: () => Boolean(process.env.GROQ_API_KEY) };
