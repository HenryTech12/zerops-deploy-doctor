// "Connect repo" — the real GitHub App flow: the frontend links out to
// GitHub's own install page, then uses these endpoints to list the repos
// that installation was granted and to pick which one (and which yaml file)
// F2's apply-fix should commit to.
const express = require("express");
const github = require("../lib/github");
const repoConnection = require("../lib/repoConnection");

const router = express.Router();

function requireConfigured(res) {
  if (!github.isWriteConfigured()) {
    res.status(503).json({ error: "GitHub App not configured (GITHUB_APP_ID/GITHUB_APP_PRIVATE_KEY)." });
    return false;
  }
  return true;
}

// Public app info (slug + install URL) — no auth needed, just identifies
// which App to install, same as any "Add to GitHub" button.
router.get("/app-info", async (req, res) => {
  if (!requireConfigured(res)) return;
  try {
    const info = await github.getAppInfo();
    res.json({
      slug: info.slug,
      name: info.name,
      install_url: `${info.html_url}/installations/new`,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to load GitHub App info", detail: err.message });
  }
});

router.get("/repos", async (req, res) => {
  if (!requireConfigured(res)) return;
  try {
    const repos = await github.listInstallationRepos();
    res.json({ repos });
  } catch (err) {
    res.status(500).json({ error: "Failed to list installation repos", detail: err.message });
  }
});

router.get("/repos/:owner/:repo/files", async (req, res) => {
  if (!requireConfigured(res)) return;
  const { owner, repo } = req.params;
  const branch = req.query.branch || "main";
  try {
    const files = await github.listInstallationYamlFiles(owner, repo, branch);
    res.json({ files });
  } catch (err) {
    res.status(500).json({ error: "Failed to list repo files", detail: err.message });
  }
});

router.get("/repos/:owner/:repo/source-files", async (req, res) => {
  if (!requireConfigured(res)) return;
  const { owner, repo } = req.params;
  const branch = req.query.branch || "main";
  try {
    const files = await github.listInstallationSourceFiles(owner, repo, branch);
    res.json({ files });
  } catch (err) {
    res.status(500).json({ error: "Failed to list repo source files", detail: err.message });
  }
});

router.get("/repos/:owner/:repo/branches", async (req, res) => {
  if (!requireConfigured(res)) return;
  const { owner, repo } = req.params;
  try {
    const branches = await github.listInstallationBranches(owner, repo);
    res.json({ branches });
  } catch (err) {
    res.status(500).json({ error: "Failed to list repo branches", detail: err.message });
  }
});

router.get("/connection", async (req, res) => {
  try {
    const connection = await repoConnection.getConnection();
    res.json({ connection });
  } catch (err) {
    res.status(500).json({ error: "Failed to load connection", detail: err.message });
  }
});

// The connected file's current content — lets the dashboard prefill the
// diagnose form with the real zerops.yaml instead of the user copy-pasting
// it in by hand.
router.get("/connection/content", async (req, res) => {
  if (!requireConfigured(res)) return;
  try {
    const connection = await repoConnection.getConnection();
    if (!connection) return res.status(404).json({ error: "No repo connected." });
    const content = await github.getFileContent(
      connection.owner,
      connection.repo,
      connection.yaml_path,
      connection.branch
    );
    res.json({ content });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch file content", detail: err.message });
  }
});

router.post("/connection", async (req, res) => {
  const { owner, repo, branch, yaml_path } = req.body || {};
  if (!owner || !repo) {
    return res.status(400).json({ error: "owner and repo are required." });
  }
  try {
    const connection = await repoConnection.setConnection({ owner, repo, branch, yaml_path });
    res.json({ connection });
  } catch (err) {
    res.status(500).json({ error: "Failed to save connection", detail: err.message });
  }
});

module.exports = router;
