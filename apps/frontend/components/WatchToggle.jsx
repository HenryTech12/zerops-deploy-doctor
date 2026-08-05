"use client";

import { useEffect, useRef, useState } from "react";
import { getWatchStatus } from "../lib/api";

const POLL_MS = 30000;

// F8 — page-open polling only. Flip on, walk away, come back to a caught
// failure. No background jobs, webhooks, or notifications (that's v2).
export default function WatchToggle({ onCaught }) {
  const [watching, setWatching] = useState(false);
  const [lastChecked, setLastChecked] = useState(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!watching) {
      clearInterval(intervalRef.current);
      return;
    }

    const poll = async () => {
      try {
        const result = await getWatchStatus();
        setLastChecked(new Date());
        if (result.triggered && result.diagnosis) {
          onCaught?.(result.diagnosis);
        }
      } catch {
        // transient poll failure — try again on the next tick
      }
    };

    poll();
    intervalRef.current = setInterval(poll, POLL_MS);
    return () => clearInterval(intervalRef.current);
  }, [watching, onCaught]);

  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-panel px-4 py-3">
      <button
        onClick={() => setWatching((w) => !w)}
        className={`relative h-6 w-11 rounded-full transition ${
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
              ? `Last checked ${lastChecked.toLocaleTimeString()} — polling every 30s`
              : "Checking…"
            : "Off — flip on to catch a failed deploy automatically"}
        </p>
      </div>
    </div>
  );
}
