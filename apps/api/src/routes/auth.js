// Landing page "Continue with GitHub" — user-to-server OAuth via the same
// GitHub App already used for repo access (see githubOAuth.js). Stateless
// by design: no server-side sessions, the signed-in username is handed
// back to the frontend as a redirect query param and stored client-side
// (localStorage), matching this app's existing "replays are public by
// design" posture — this only tags who made a diagnosis, it never gates
// access to anything.
const express = require("express");
const crypto = require("crypto");
const githubOAuth = require("../lib/githubOAuth");

const router = express.Router();

function callbackUrl() {
  // Deliberately an explicit env var, not derived from the request — this
  // project has been burned before by proxy/host-header mismatches (see
  // the CORS exact-match notes elsewhere) and GitHub's OAuth redirect_uri
  // must match exactly.
  return `${process.env.API_PUBLIC_URL}/api/auth/github/callback`;
}

function parseCookie(req, name) {
  const header = req.headers.cookie || "";
  const match = header.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

router.get("/github/login", (req, res) => {
  const frontend = process.env.FRONTEND_ORIGIN || "/";
  if (!githubOAuth.isConfigured() || !process.env.API_PUBLIC_URL) {
    // Graceful fallback — the whole app works without sign-in, this is a
    // pure enhancement, so an unconfigured OAuth setup should never block
    // anyone from reaching the dashboard.
    return res.redirect(`${frontend}/dashboard`);
  }

  const state = crypto.randomBytes(16).toString("hex");
  res.setHeader(
    "Set-Cookie",
    `dd_oauth_state=${state}; HttpOnly; Max-Age=600; Path=/; SameSite=Lax`
  );
  res.redirect(githubOAuth.getLoginUrl(callbackUrl(), state));
});

router.get("/github/callback", async (req, res) => {
  const frontend = process.env.FRONTEND_ORIGIN || "/";
  const { code, state } = req.query;
  const expectedState = parseCookie(req, "dd_oauth_state");

  res.setHeader("Set-Cookie", "dd_oauth_state=; Max-Age=0; Path=/");

  if (!code || !state || !expectedState || state !== expectedState) {
    return res.redirect(`${frontend}/dashboard?gh_error=state_mismatch`);
  }

  try {
    const { username, avatarUrl } = await githubOAuth.exchangeCodeForUser(code, callbackUrl());
    const params = new URLSearchParams({ gh_user: username, gh_avatar: avatarUrl || "" });
    res.redirect(`${frontend}/dashboard?${params.toString()}`);
  } catch (err) {
    console.error("GitHub OAuth callback error:", err);
    res.redirect(`${frontend}/dashboard?gh_error=oauth_failed`);
  }
});

module.exports = router;
