// GitHub user login (landing page "Continue with GitHub") — separate from
// githubApp.js's App-to-server installation tokens. This is standard
// "user-to-server" OAuth, and reuses the SAME GitHub App's Client ID/Secret
// (found on the App's general settings page, no second app registration
// needed) rather than requiring a separate classic OAuth App.
const API_BASE = "https://api.github.com";

function isConfigured() {
  return Boolean(process.env.GITHUB_OAUTH_CLIENT_ID && process.env.GITHUB_OAUTH_CLIENT_SECRET);
}

function getLoginUrl(redirectUri, state) {
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_OAUTH_CLIENT_ID,
    redirect_uri: redirectUri,
    state,
    scope: "read:user",
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

/** Exchanges a callback `code` for the signed-in user's GitHub login + avatar. */
async function exchangeCodeForUser(code, redirectUri) {
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: process.env.GITHUB_OAUTH_CLIENT_ID,
      client_secret: process.env.GITHUB_OAUTH_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenRes.ok || tokenData.error || !tokenData.access_token) {
    throw new Error(`GitHub OAuth token exchange failed: ${tokenData.error_description || tokenData.error || tokenRes.status}`);
  }

  const userRes = await fetch(`${API_BASE}/user`, {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "DeployDoctor",
    },
  });
  if (!userRes.ok) {
    throw new Error(`GitHub user lookup failed: ${userRes.status} ${await userRes.text()}`);
  }
  const user = await userRes.json();
  return { username: user.login, avatarUrl: user.avatar_url };
}

module.exports = { isConfigured, getLoginUrl, exchangeCodeForUser };
