"use client";

import { useEffect, useState } from "react";
import { disableWatch, enableWatch, getWatchState } from "../lib/api";

const REFRESH_MS = 30000;

// F8 — the actual runtime-log check now runs server-side on a real timer
// (watchScheduler.js), independent of this tab being open. This component
// is just the on/off toggle (persisted, so it restores correctly after a
// refresh) plus a light read-only poll of when the server last checked —
// it no longer does any checking itself.
export default function WatchToggle() {
  const [watching, setWatching] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [lastChecked, setLastChecked] = useState(null);

  useEffect(() => {
    function refresh() {
      getWatchState()
        .then((r) => {
          setWatching(r.enabled);
          if (r.last_checked) setLastChecked(new Date(r.last_checked));
        })
        .catch(() => {})
        .finally(() => setLoadingInitial(false));
    }
    refresh();
    const interval = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(interval);
  }, []);

  async function toggle() {
    const next = !watching;
    setWatching(next); // optimistic
    try {
      await (next ? enableWatch() : disableWatch());
    } catch {
      setWatching(!next); // revert if the persist call failed
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-panel px-4 py-3">
      <button
        onClick={toggle}
        disabled={loadingInitial}
        className={`relative h-6 w-11 rounded-full transition disabled:opacity-50 ${
          watching ? "bg-amber" : "bg-white/10"
        }`}
        aria-pressed={watching}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-bg transition ${
            watching ? "left-5" : "left-0.5"
          }`}
        />
      </button>
      <div>
        <p className="text-sm text-text-primary">
          Watch Mode {watching && <span className="text-amber">● active</span>}
        </p>
        <p className="text-xs text-text-muted">
          {watching
            ? lastChecked
              ? `Server last checked ${lastChecked.toLocaleTimeString()} — runs continuously`
              : "Starting…"
            : "Off — flip on to catch runtime errors automatically"}
        </p>
      </div>
    </div>
  );
}
