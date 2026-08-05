"use client";

const DIFFICULTY_STARS = { Beginner: 1, Intermediate: 2, Advanced: 3 };

export default function DiagnosisCard({ diagnosis }) {
  if (!diagnosis) return null;
  const stars = DIFFICULTY_STARS[diagnosis.difficulty] || 1;

  return (
    <div className="rounded-lg border border-white/10 bg-panel p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-text-muted">Root cause</span>
        <span
          className={`text-xs px-2 py-0.5 rounded-full border ${
            diagnosis.error_type === "code"
              ? "border-aiblue/40 text-aiblue"
              : "border-coral/40 text-coral"
          }`}
        >
          {diagnosis.error_type === "code" ? "Code error" : "Config error"}
        </span>
      </div>

      <p className="font-display text-lg text-text-primary">{diagnosis.cause}</p>

      <div className="rounded-md bg-inset border border-aiblue/20 p-3">
        <p className="text-xs text-aiblue mb-1 font-mono">AI explanation</p>
        <p className="text-sm text-text-secondary">{diagnosis.explanation}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-md bg-inset p-3">
          <p className="text-xs text-text-muted mb-1">Why did this happen?</p>
          <p className="text-sm text-text-secondary">{diagnosis.suggested_fix}</p>
        </div>
        <div className="rounded-md bg-inset p-3">
          <p className="text-xs text-text-muted mb-1">Next time…</p>
          <p className="text-sm text-text-secondary">{diagnosis.next_time_tip}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-text-muted">Difficulty</span>
        {[1, 2, 3].map((n) => (
          <span key={n} className={n <= stars ? "text-amber" : "text-white/10"}>
            ★
          </span>
        ))}
        <span className="text-xs text-text-secondary ml-1">{diagnosis.difficulty}</span>
      </div>
    </div>
  );
}
