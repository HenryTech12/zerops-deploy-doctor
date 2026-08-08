"use client";

import { API_URL } from "../lib/api";

// Shows who's signed in (via the landing page's "Continue with GitHub"),
// or a small prompt to sign in — this is additive, not a gate: everything
// on the dashboard works fully signed-out, this only tags diagnoses so
// they show up in "Recent diagnoses" and survive a refresh.
export default function UserBadge({ username, avatarUrl, onSignOut }) {
  if (!username) {
    return (
      <a
        href={`${API_URL}/api/auth/github/login`}
        className="flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:border-white/20 transition"
      >
        Sign in with GitHub to save your history
      </a>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-white/10 px-2 py-1.5">
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="h-5 w-5 rounded-full" />
      ) : (
        <div className="h-5 w-5 rounded-full bg-white/10" />
      )}
      <span className="text-xs text-text-primary whitespace-nowrap">@{username}</span>
      <button
        onClick={onSignOut}
        className="text-xs text-text-muted hover:text-text-primary transition whitespace-nowrap"
      >
        Sign out
      </button>
    </div>
  );
}
