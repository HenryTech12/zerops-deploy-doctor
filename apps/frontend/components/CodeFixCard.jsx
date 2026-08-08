"use client";

import { useState } from "react";
import DiffViewer from "./DiffViewer";

// F7 — copy-paste is still the default (DeployDoctor never writes to your
// application code by default). The one deliberate exception: when the
// diagnosis pipeline could fetch the file's real current content
// (originalFileContent present), it means code_suggestion is a verified
// full-file replacement, not a snippet, and it's safe to diff and offer a
// commit — still an explicit click, gated behind a confidence score so
// the user decides with real information instead of a black box.
const CONFIDENCE_STYLES = {
  high: { text: "text-teal", bg: "bg-teal/10", border: "border-teal/30", label: "High confidence" },
  medium: { text: "text-amber", bg: "bg-amber/10", border: "border-amber/30", label: "Medium confidence" },
  low: { text: "text-coral", bg: "bg-coral/10", border: "border-coral/30", label: "Low confidence" },
};

function confidenceBucket(score) {
  if (score >= 80) return "high";
  if (score >= 40) return "medium";
  return "low";
}

export default function CodeFixCard({ diagnosis, onCommit, applying, applyState }) {
  const [copied, setCopied] = useState(false);
  const [confirmingCommit, setConfirmingCommit] = useState(false);

  if (!diagnosis?.code_suggestion) return null;
  const { file_path: filePath, code_suggestion: codeSuggestion, confidence, confidence_reason, original_file_content } = diagnosis;

  const canCommit = Boolean(original_file_content) && Boolean(onCommit);
  const bucket = typeof confidence === "number" ? confidenceBucket(confidence) : null;
  const style = bucket ? CONFIDENCE_STYLES[bucket] : null;

  async function copy() {
    await navigator.clipboard.writeText(codeSuggestion);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function handleCommitClick() {
    // Low confidence gets a second "are you sure" step instead of
    // blocking the commit outright — the score informs the decision, it
    // doesn't override it.
    if (bucket === "low" && !confirmingCommit) {
      setConfirmingCommit(true);
      return;
    }
    setConfirmingCommit(false);
    onCommit();
  }

  return (
    <div className="rounded-lg border border-white/10 bg-panel p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs uppercase tracking-wide text-text-muted">
          {canCommit ? "Code fix" : "Suggested code fix"}
        </span>
        {style && (
          <span
            className={`shrink-0 rounded-full ${style.bg} ${style.text} border ${style.border} text-[10px] font-medium px-2 py-0.5`}
            title={confidence_reason || ""}
          >
            {style.label} · {confidence}%
          </span>
        )}
      </div>

      {confidence_reason && <p className="text-xs text-text-muted">{confidence_reason}</p>}

      {canCommit ? (
        <>
          <DiffViewer before={original_file_content} after={codeSuggestion} filename={filePath} />

          {!confirmingCommit ? (
            <button
              onClick={handleCommitClick}
              disabled={applying}
              className="w-full rounded-md bg-teal text-bg font-medium py-2 text-sm hover:bg-teal/90 transition disabled:opacity-50"
            >
              {applying ? "Redeploying…" : "Commit fix and redeploy"}
            </button>
          ) : (
            <div className="rounded-md border border-coral/30 bg-coral/5 p-3 space-y-2">
              <p className="text-xs text-coral">
                Confidence is low ({confidence}%) — the root cause may be uncertain or need context
                DeployDoctor doesn't have. Commit anyway?
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setConfirmingCommit(false)}
                  className="flex-1 rounded-md border border-white/10 py-1.5 text-xs text-text-secondary hover:text-text-primary transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCommitClick}
                  className="flex-1 rounded-md bg-coral text-bg font-medium py-1.5 text-xs hover:bg-coral/90 transition"
                >
                  Commit anyway
                </button>
              </div>
            </div>
          )}

          {applyState === "success" && (
            <p className="text-sm text-teal">Redeploy succeeded — service is healthy.</p>
          )}
          {applyState === "stopped" && (
            <p className="text-sm text-coral">
              Still failing after 3 automatic attempts — stopping here. Take a look manually.
            </p>
          )}

          <p className="text-xs text-text-muted">
            Committed straight to {filePath} on your connected repo — same push-to-branch redeploy
            as any config fix. Copy-paste is always available too, below.
          </p>
        </>
      ) : (
        <>
          {filePath && <p className="font-mono text-xs text-text-secondary">{filePath}</p>}
          <pre className="rounded-md bg-inset border border-white/10 p-3 overflow-x-auto font-mono text-xs text-text-primary whitespace-pre">
            {codeSuggestion}
          </pre>
          <p className="text-xs text-text-muted">
            {original_file_content === undefined
              ? "DeployDoctor never writes to your repo — paste this in, then push. Zerops redeploys on push and the timeline records the cycle like any other attempt."
              : "Couldn't verify this against the file's real current content, so it's copy-paste only — paste it in, then push."}
          </p>
        </>
      )}

      <div className="flex justify-end">
        <button
          onClick={copy}
          className="text-xs px-3 py-1 rounded-md bg-teal/10 text-teal border border-teal/30 hover:bg-teal/20 transition"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
