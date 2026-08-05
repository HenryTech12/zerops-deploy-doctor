// GET /api/patterns/:id/stats — F5 stat-tile data. Real counts only, no fabrication.
const express = require("express");
const { query } = require("../db");

const router = express.Router();

router.get("/:id/stats", async (req, res) => {
  const { rows } = await query("SELECT * FROM failure_patterns WHERE id = $1", [req.params.id]);
  const pattern = rows[0];
  if (!pattern) return res.status(404).json({ error: "Pattern not found." });

  const avgFixSeconds = pattern.fixed_count > 0 ? pattern.total_fix_seconds / pattern.fixed_count : null;
  const resolvedPct = pattern.seen_count > 0 ? Math.round((pattern.fixed_count / pattern.seen_count) * 100) : null;

  res.json({
    id: pattern.id,
    title: pattern.title,
    category: pattern.category,
    difficulty: pattern.difficulty,
    docs_url: pattern.docs_url,
    seen_count: pattern.seen_count,
    fixed_count: pattern.fixed_count,
    resolved_pct: resolvedPct,
    avg_fix_seconds: avgFixSeconds,
  });
});

module.exports = router;
