"use client";

import { useState } from "react";

function BellMark({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

const ERROR_TYPE_STYLES = {
  code: "text-aiblue",
  config: "text-text-secondary",
};

function timeAgo(iso) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// What Watch Mode caught, as a real dismissible in-app notification (DB
// row, not React state) — a bell + unread badge is the familiar pattern
// for "here's something you should look at when you get a chance."
export default function NotificationBell({ notifications, onOpen, onSelect }) {
  const [open, setOpen] = useState(false);
  const unseenCount = notifications.filter((n) => !n.seen).length;

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) onOpen?.();
  }

  function select(id) {
    onSelect?.(id);
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        onClick={toggle}
        className="relative flex items-center justify-center h-9 w-9 rounded-md border border-white/10 text-text-secondary hover:text-text-primary hover:border-white/20 transition"
        aria-label="Notifications"
      >
        <BellMark className="h-4 w-4" />
        {unseenCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-coral text-white text-[10px] font-medium px-1">
            {unseenCount > 9 ? "9+" : unseenCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          {/* fixed + viewport-relative offsets throughout (not absolute
              anchored to the bell's own narrow wrapper) — the bell isn't
              guaranteed to sit at the row's right edge once WatchToggle is
              beside it, so a parent-anchored dropdown overflowed off the
              left edge in exactly that case. */}
          <div className="fixed inset-x-4 top-16 sm:inset-x-auto sm:right-6 sm:w-80 z-50 rounded-lg border border-white/10 bg-panel shadow-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10">
              <p className="text-sm text-text-primary">Watch Mode notifications</p>
              <p className="text-xs text-text-muted mt-0.5">
                Caught by the background check — click one to review and decide on a fix.
              </p>
            </div>

            <div className="max-h-80 overflow-y-auto divide-y divide-white/10">
              {notifications.length === 0 && (
                <p className="p-4 text-xs text-text-muted text-center">
                  Nothing yet — flip on Watch Mode and this fills in when it catches something.
                </p>
              )}

              {notifications.map((n) => (
                <div key={n.id} className="flex items-stretch hover:bg-white/5 transition">
                  <button onClick={() => select(n.id)} className="flex-1 text-left px-4 py-3 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-[10px] uppercase tracking-wide ${ERROR_TYPE_STYLES[n.error_type] || "text-text-muted"}`}>
                        {n.error_type || "issue"}
                      </span>
                      <span className="text-[10px] text-text-muted shrink-0">{timeAgo(n.created_at)}</span>
                    </div>
                    <p className="text-sm text-text-primary mt-1 line-clamp-2">{n.cause}</p>
                  </button>
                  <a
                    href={`/replay/${n.replay_id}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center px-3 text-text-muted hover:text-aiblue transition shrink-0"
                    title="Open shareable replay"
                    aria-label="Open shareable replay"
                  >
                    ↗
                  </a>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
