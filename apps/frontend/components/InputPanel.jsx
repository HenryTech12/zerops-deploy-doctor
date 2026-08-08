"use client";

import { useEffect, useState } from "react";

export default function InputPanel({ onSubmit, loading, initialYaml, onReloadYaml, reloadingYaml }) {
  const [yaml, setYaml] = useState(initialYaml || "");
  const [log, setLog] = useState("");
  const [text, setText] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [mode, setMode] = useState("structured"); // structured | text

  // initialYaml changes when a repo connection is (re)loaded — pulling the
  // real committed zerops.yaml in so the user only has to paste the error
  // log, not copy-paste the config by hand.
  useEffect(() => {
    if (initialYaml !== undefined) setYaml(initialYaml);
  }, [initialYaml]);

  function submit(e) {
    e.preventDefault();
    onSubmit({ yaml, log, text: mode === "text" ? text : undefined, repo_url: repoUrl || undefined });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex gap-2 text-xs">
        <button
          type="button"
          onClick={() => setMode("structured")}
          className={`px-3 py-1 rounded-md border ${
            mode === "structured"
              ? "border-teal/40 text-teal bg-teal/10"
              : "border-white/10 text-text-muted"
          }`}
        >
          yaml + log
        </button>
        <button
          type="button"
          onClick={() => setMode("text")}
          className={`px-3 py-1 rounded-md border ${
            mode === "text" ? "border-teal/40 text-teal bg-teal/10" : "border-white/10 text-text-muted"
          }`}
        >
          plain English
        </button>
      </div>

      {mode === "structured" ? (
        <>
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs text-text-muted">zerops.yaml</label>
              {onReloadYaml && (
                <button
                  type="button"
                  onClick={onReloadYaml}
                  disabled={reloadingYaml}
                  className="text-xs text-aiblue hover:underline disabled:opacity-50"
                >
                  {reloadingYaml ? "Loading…" : "Reload from connected repo"}
                </button>
              )}
            </div>
            <textarea
              value={yaml}
              onChange={(e) => setYaml(e.target.value)}
              rows={8}
              placeholder="paste your zerops.yaml…"
              className="mt-1 w-full rounded-md bg-inset border border-white/10 p-3 font-mono text-xs text-text-primary focus:outline-none focus:border-teal/40"
            />
          </div>
          <div>
            <label className="text-xs text-text-muted">Error log</label>
            <textarea
              value={log}
              onChange={(e) => setLog(e.target.value)}
              rows={8}
              placeholder="paste the failing deploy log…"
              className="mt-1 w-full rounded-md bg-inset border border-white/10 p-3 font-mono text-xs text-text-primary focus:outline-none focus:border-teal/40"
            />
          </div>
        </>
      ) : (
        <div>
          <label className="text-xs text-text-muted">What's wrong?</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder="my API isn't reachable…"
            className="mt-1 w-full rounded-md bg-inset border border-white/10 p-3 text-sm text-text-primary focus:outline-none focus:border-teal/40"
          />
        </div>
      )}

      <div>
        <label className="text-xs text-text-muted">Public GitHub repo (optional — for code errors)</label>
        <input
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          placeholder="https://github.com/owner/repo"
          className="mt-1 w-full rounded-md bg-inset border border-white/10 p-2 text-sm text-text-primary focus:outline-none focus:border-teal/40"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-teal text-bg font-medium py-2 text-sm hover:bg-teal/90 transition disabled:opacity-50"
      >
        {loading ? "Diagnosing…" : "Diagnose"}
      </button>
    </form>
  );
}
