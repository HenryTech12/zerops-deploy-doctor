"use client";

import { useState } from "react";

// F7 — the tool never writes to the repo. It shows file, line, and a
// copy-paste replacement; the user applies it and pushes themselves.
export default function CodeFixCard({ filePath, codeSuggestion }) {
  const [copied, setCopied] = useState(false);
  if (!codeSuggestion) return null;

  async function copy() {
    await navigator.clipboard.writeText(codeSuggestion);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="rounded-lg border border-white/10 bg-panel p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-text-muted">
          Suggested code fix
        </span>
        <button
          onClick={copy}
          className="text-xs px-3 py-1 rounded-md bg-teal/10 text-teal border border-teal/30 hover:bg-teal/20 transition"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {filePath && <p className="font-mono text-xs text-text-secondary">{filePath}</p>}
      <pre className="rounded-md bg-inset border border-white/10 p-3 overflow-x-auto font-mono text-xs text-text-primary whitespace-pre">
        {codeSuggestion}
      </pre>
      <p className="text-xs text-text-muted">
        DeployDoctor never writes to your repo — paste this in, then push. Zerops redeploys on
        push and the timeline records the cycle like any other attempt.
      </p>
    </div>
  );
}
