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

// `process.env.FRONTEND_ORIGIN || "/"` looked like a safe fallback but
// isn't: "/" + "/dashboard" is "//dashboard", which browsers parse as a
// protocol-relative URL — i.e. "go to a host literally named dashboard"
// (confirmed live: DNS_PROBE_FINISHED_NXDOMAIN). Only ever redirect to a
// real absolute origin; anything else is treated as "not configured."
function frontendOrigin() {
  const origin = (process.env.FRONTEND_ORIGIN || "").trim();
  return /^https?:\/\//.test(origin) ? origin.replace(/\/$/, "") : null;
}

// Confirmed-correct env var value still failing live despite a full
// container restart — this exposes exactly what the running process sees
// (length + JSON-escaped, so invisible/non-ASCII characters show up as
// \uXXXX) instead of guessing further blind. Not a secret, safe to surface.
function debugEnvState() {
  const raw = process.env.FRONTEND_ORIGIN;
  return `FRONTEND_ORIGIN raw=${JSON.stringify(raw)} length=${raw ? raw.length : 0}`;
}

function parseCookie(req, name) {
  const header = req.headers.cookie || "";
  const match = header.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

// One-shot diagnostic — no OAuth round trip needed to see what this
// specific running process actually has in process.env. Only exposes
// FRONTEND_ORIGIN/API_PUBLIC_URL raw (not secrets) and booleans for the
// OAuth client credentials.
router.get("/debug", (req, res) => {
  res.json({
    frontend_origin_raw: process.env.FRONTEND_ORIGIN ?? null,
    frontend_origin_valid: Boolean(frontendOrigin()),
    api_public_url_raw: process.env.API_PUBLIC_URL ?? null,
    oauth_client_id_set: Boolean(process.env.GITHUB_OAUTH_CLIENT_ID),
    oauth_client_secret_set: Boolean(process.env.GITHUB_OAUTH_CLIENT_SECRET),
  });
});

router.get("/github/login", (req, res) => {
  const frontend = frontendOrigin();
  if (!frontend) {
    return res
      .status(500)
      .send(
        `FRONTEND_ORIGIN is not set (or isn't a full https:// URL) on the api service — cannot complete GitHub sign-in. Set it and retry, or use the dashboard's "Skip" link. [debug: ${debugEnvState()}]`
      );
  }
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
  const frontend = frontendOrigin();
  if (!frontend) {
    return res
      .status(500)
      .send(
        `FRONTEND_ORIGIN is not set (or isn't a full https:// URL) on the api service — cannot complete GitHub sign-in. [debug: ${debugEnvState()}]`
      );
  }

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
