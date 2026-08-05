"use client";

// F5 — real numbers only, however small. Never fabricate scale.
export default function StatsTiles({ stats }) {
  if (!stats) return null;

  const avgFix =
    stats.avg_fix_seconds != null ? `${Math.round(stats.avg_fix_seconds)}s` : "—";
  const resolved = stats.resolved_pct != null ? `${stats.resolved_pct}%` : "—";

  return (
    <div className="grid grid-cols-3 gap-3">
      <Tile label="Times seen" value={stats.seen_count} />
      <Tile label="Resolved by canonical fix" value={resolved} />
      <Tile label="Avg. fix time" value={avgFix} />
    </div>
  );
}

function Tile({ label, value }) {
  return (
    <div className="rounded-lg border border-white/10 bg-panel p-3 text-center">
      <p className="font-display text-2xl text-teal">{value}</p>
      <p className="text-xs text-text-muted mt-1">{label}</p>
    </div>
  );
}
