// Fast, deterministic pattern matcher. Runs before the LLM call so the LLM gets
// grounded context instead of guessing from scratch (see doc §8, Call A).
const { query } = require("../db");

// Signatures are authored Postgres-style, e.g. "(?i)pattern" for case-insensitive.
// JS RegExp has no inline (?i) flag support, so translate it to the `i` flag.
function compileSignature(signature) {
  const m = signature.match(/^\(\?i\)(.*)$/s);
  return m ? new RegExp(m[1], "i") : new RegExp(signature);
}

// Config-shaped checks that don't need a log line at all — cheap wins we can
// catch by just reading the yaml.
function staticYamlChecks(yamlText) {
  const findings = [];
  if (!yamlText) return findings;

  if (!/httpSupport\s*:\s*true/i.test(yamlText) && /ports\s*:/i.test(yamlText)) {
    findings.push({ hint: "ports declared without httpSupport: true anywhere in the file" });
  }
  return findings;
}

/**
 * @param {string} yamlText
 * @param {string} logText
 * @returns {Promise<{pattern: object|null, hint: string|null}>}
 */
async function matchFailurePattern(yamlText, logText) {
  const haystack = `${yamlText || ""}\n${logText || ""}`;
  if (!haystack.trim()) return { pattern: null, hint: null };

  const { rows: patterns } = await query(
    "SELECT * FROM failure_patterns WHERE signature IS NOT NULL"
  );

  for (const pattern of patterns) {
    try {
      const re = compileSignature(pattern.signature);
      if (re.test(haystack)) {
        return { pattern, hint: null };
      }
    } catch {
      // malformed signature in the DB — skip rather than crash the request
      continue;
    }
  }

  const staticHints = staticYamlChecks(yamlText);
  return { pattern: null, hint: staticHints[0]?.hint || null };
}

/** Bump seen_count the moment a pattern is matched against a real diagnosis. */
async function recordSeen(patternId) {
  if (!patternId) return;
  await query("UPDATE failure_patterns SET seen_count = seen_count + 1 WHERE id = $1", [
    patternId,
  ]);
}

/** Bump fixed_count + total_fix_seconds once a redeploy after this pattern succeeds. */
async function recordFixed(patternId, fixSeconds) {
  if (!patternId) return;
  await query(
    `UPDATE failure_patterns
     SET fixed_count = fixed_count + 1,
         total_fix_seconds = total_fix_seconds + $2
     WHERE id = $1`,
    [patternId, Math.max(0, Math.round(fixSeconds || 0))]
  );
}

/** F9 — record a fix that was applied and did NOT resolve the failure. */
async function recordFailedFix(patternId, fixSummary) {
  if (!patternId || !fixSummary) return;
  await query("INSERT INTO failed_fixes (pattern_id, fix_summary) VALUES ($1, $2)", [
    patternId,
    fixSummary,
  ]);
}

/** F9 — fetch known-bad fixes for a pattern to inject into the next LLM call. */
async function getFailedFixes(patternId) {
  if (!patternId) return [];
  const { rows } = await query(
    "SELECT fix_summary FROM failed_fixes WHERE pattern_id = $1 ORDER BY created_at DESC LIMIT 5",
    [patternId]
  );
  return rows.map((r) => r.fix_summary);
}

/** Find-or-create a pattern row for an LLM-led runtime_code diagnosis (category 4). */
async function findOrCreateCodePattern(title, canonicalFix, difficulty) {
  const { rows } = await query("SELECT * FROM failure_patterns WHERE title = $1", [title]);
  if (rows[0]) return rows[0];

  const inserted = await query(
    `INSERT INTO failure_patterns (category, signature, title, canonical_fix, difficulty)
     VALUES ('runtime_code', NULL, $1, $2, $3)
     ON CONFLICT (title) DO UPDATE SET title = EXCLUDED.title
     RETURNING *`,
    [title, canonicalFix, difficulty || "Beginner"]
  );
  return inserted.rows[0];
}

module.exports = {
  matchFailurePattern,
  recordSeen,
  recordFixed,
  recordFailedFix,
  getFailedFixes,
  findOrCreateCodePattern,
};
