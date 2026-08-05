// Claude orchestration — Call A (diagnose+fix, F1/F2/F4/F7) and Call B (NL router, F3).
// Both calls: strip ```json fences defensively, parse, retry once on bad JSON,
// then fall back to a rules-engine-only answer. See doc §8.
const Anthropic = require("@anthropic-ai/sdk");

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";

let _client = null;
function client() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

function stripFences(text) {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

async function callClaudeJSON({ system, user, maxTokens = 1500 }) {
  const anthropic = client();
  if (!anthropic) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const ask = async (userText) => {
    const resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: userText }],
    });
    return resp.content.map((b) => (b.type === "text" ? b.text : "")).join("");
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

const DIAGNOSE_SYSTEM_PROMPT = `You are a Zerops deployment expert. Given a zerops.yaml file, an error log, and optionally relevant source files, identify the root cause and classify it: "config" (fixable by changing zerops.yaml) or "code" (a bug in the application source). Explain the root cause in plain English for a developer new to Zerops. For config errors, produce a corrected zerops.yaml. For code errors, identify the file and line and produce a corrected code block the user can copy and apply themselves. Also provide a one-sentence tip to avoid this next time, and rate the difficulty (Beginner/Intermediate/Advanced). Respond with JSON only, no markdown fences: {"error_type": "config"|"code", "cause": "...", "explanation": "...", "suggested_fix": "...", "fixed_yaml": "..."|null, "file_path": "..."|null, "code_suggestion": "..."|null, "next_time_tip": "...", "difficulty": "..."}`;

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

  return callClaudeJSON({ system: DIAGNOSE_SYSTEM_PROMPT, user });
}

const ROUTER_SYSTEM_PROMPT = `You are a triage assistant for Zerops deployments. Given a user's free-text description of a problem, classify what should be checked. Respond with JSON only: {"check_type": "config" | "logs" | "status", "reasoning": "..."}`;

/** Call B — NL router (F3). */
async function routeFreeText(text) {
  return callClaudeJSON({ system: ROUTER_SYSTEM_PROMPT, user: text, maxTokens: 300 });
}

module.exports = { diagnose, routeFreeText, isConfigured: () => Boolean(process.env.ANTHROPIC_API_KEY) };
