"use client";

import { useEffect, useState } from "react";
import { getMyReplays } from "../lib/api";

const STATUS_STYLES = {
  fail: "text-coral",
  success: "text-teal",
  pending: "text-amber",
};

// Refreshing the dashboard used to lose everything — the replay_id from
// the last diagnose() call only ever lived in React state. This restores
// visibility into past work (for a signed-in username) via a proper DB
// query instead, without trying to fully "resume" editable state.
export default function RecentDiagnoses({ username }) {
  const [replays, setReplays] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!username) return;
    getMyReplays(username)
      .then((r) => setReplays(r.replays))
      .catch(() => setReplays(null));
  }, [username]);

  if (!replays || replays.length === 0) return null;

  return (
    <div className="rounded-lg border border-white/10 bg-panel p-4">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between w-full text-left"
      >
        <span className="text-sm text-text-primary">
          Recent diagnoses <span className="text-text-muted">({replays.length})</span>
        </span>
        <span className="text-xs text-text-muted">{open ? "Hide" : "Show"}</span>
      </button>

      {open && (
        <ul className="mt-3 divide-y divide-white/10 border-t border-white/10 -mx-4 px-4">
          {replays.map((r) => (
            <li key={r.id}>
              <a
                href={`/replay/${r.id}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between gap-3 py-2.5 hover:bg-white/5 transition -mx-1 px-1 rounded"
              >
                <span className="text-sm text-text-primary truncate">
                  {r.title || "Untitled diagnosis"}
                </span>
                <span className="shrink-0 flex items-center gap-2 text-xs">
                  <span className={STATUS_STYLES[r.latest_status] || "text-text-muted"}>
                    {r.latest_status || "—"}
                  </span>
                  <span className="text-text-muted">
                    {new Date(r.created_at).toLocaleDateString()}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
