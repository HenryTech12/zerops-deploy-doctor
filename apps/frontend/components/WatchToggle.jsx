"use client";

import { useEffect, useRef, useState } from "react";
import { disableWatch, enableWatch, getWatchState, getWatchStatus } from "../lib/api";

const POLL_MS = 30000;

// F8 — the on/off toggle is now persisted server-side (watch_state), so it
// correctly shows "still on" after a refresh instead of resetting. Actual
// checking is still done by the browser polling while the page is open —
// there's no background worker (see README roadmap) — this just means the
// toggle no longer lies about its own state.
export default function WatchToggle({ onCaught, onNotification }) {
  const [watching, setWatching] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [lastChecked, setLastChecked] = useState(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    getWatchState()
      .then((r) => setWatching(r.enabled))
      .catch(() => {})
      .finally(() => setLoadingInitial(false));
  }, []);

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
          onNotification?.();
        }
      } catch {
        // transient poll failure — try again on the next tick
      }
    };

    poll();
    intervalRef.current = setInterval(poll, POLL_MS);
    return () => clearInterval(intervalRef.current);
  }, [watching, onCaught, onNotification]);

  async function toggle() {
    const next = !watching;
    setWatching(next); // optimistic — polling starts/stops immediately
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
              ? `Last checked ${lastChecked.toLocaleTimeString()} — polling every 30s`
              : "Checking…"
            : "Off — flip on to catch a failed deploy automatically"}
        </p>
      </div>
    </div>
  );
}
