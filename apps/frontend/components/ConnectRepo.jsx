"use client";

import { useEffect, useState } from "react";
import {
  getGithubAppInfo,
  getGithubConnection,
  listGithubRepoFiles,
  listGithubRepos,
  saveGithubConnection,
} from "../lib/api";

// F2's real "connect a repo" flow: install the GitHub App (GitHub's own
// install page, same pattern Vercel/Netlify use), pick which of the
// installation's repos + which yaml file apply-fix should commit to. No
// static PATIENT_REPO env var needed once a connection is saved here.
export default function ConnectRepo() {
  const [appInfo, setAppInfo] = useState(null);
  const [repos, setRepos] = useState(null);
  const [files, setFiles] = useState([]);
  const [connection, setConnection] = useState(null);
  const [selectedRepo, setSelectedRepo] = useState("");
  const [branch, setBranch] = useState("main");
  const [yamlPath, setYamlPath] = useState("zerops.yaml");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    getGithubAppInfo().then(setAppInfo).catch(() => setAppInfo(null));
    getGithubConnection()
      .then((r) => setConnection(r.connection))
      .catch(() => setConnection(null));
  }, []);

  async function loadRepos() {
    setLoading(true);
    setError(null);
    try {
      const r = await listGithubRepos();
      setRepos(r.repos);
      if (r.repos[0]) selectRepo(r.repos[0]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function selectRepo(repo) {
    setSelectedRepo(repo.full_name);
    setBranch(repo.default_branch || "main");
    setFiles([]);
    listGithubRepoFiles(repo.owner, repo.repo, repo.default_branch || "main")
      .then((r) => setFiles(r.files))
      .catch(() => setFiles([]));
  }

  async function onSave() {
    if (!selectedRepo) return;
    const [owner, repo] = selectedRepo.split("/");
    setSaving(true);
    setError(null);
    try {
      const r = await saveGithubConnection({ owner, repo, branch, yaml_path: yamlPath });
      setConnection(r.connection);
      setOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-white/10 bg-panel p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-text-primary">Connected repo</p>
          <p className="text-xs text-text-muted">
            {connection
              ? `${connection.owner}/${connection.repo} @ ${connection.branch} — ${connection.yaml_path}`
              : "None connected — apply-fix has nothing to commit to yet"}
          </p>
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          className="text-xs text-aiblue hover:underline"
        >
          {open ? "Close" : connection ? "Change" : "Connect repo"}
        </button>
      </div>

      {open && (
        <div className="space-y-3 border-t border-white/10 pt-3">
          {appInfo && (
            <a
              href={appInfo.install_url}
              target="_blank"
              rel="noreferrer"
              className="inline-block rounded-md bg-teal text-bg text-xs font-medium px-3 py-2 hover:bg-teal/90 transition"
            >
              Install / manage {appInfo.name} on GitHub ↗
            </a>
          )}

          <button
            onClick={loadRepos}
            disabled={loading}
            className="block text-xs text-text-secondary underline disabled:opacity-50"
          >
            {loading ? "Loading repos…" : "Refresh repo list"}
          </button>

          {repos && repos.length === 0 && (
            <p className="text-xs text-amber">
              No repos yet — install the App above and select at least one repo, then refresh.
            </p>
          )}

          {repos && repos.length > 0 && (
            <div className="space-y-2">
              <label className="block text-xs text-text-muted">
                Repository
                <select
                  value={selectedRepo}
                  onChange={(e) => selectRepo(repos.find((r) => r.full_name === e.target.value))}
                  className="mt-1 w-full rounded-md border border-white/10 bg-bg px-2 py-1.5 text-sm text-text-primary"
                >
                  {repos.map((r) => (
                    <option key={r.full_name} value={r.full_name}>
                      {r.full_name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-xs text-text-muted">
                Branch
                <input
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="mt-1 w-full rounded-md border border-white/10 bg-bg px-2 py-1.5 text-sm text-text-primary"
                />
              </label>

              <label className="block text-xs text-text-muted">
                Config file to fix (zerops.yaml)
                {files.length > 0 ? (
                  <select
                    value={yamlPath}
                    onChange={(e) => setYamlPath(e.target.value)}
                    className="mt-1 w-full rounded-md border border-white/10 bg-bg px-2 py-1.5 text-sm text-text-primary"
                  >
                    {files.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={yamlPath}
                    onChange={(e) => setYamlPath(e.target.value)}
                    placeholder="zerops.yaml"
                    className="mt-1 w-full rounded-md border border-white/10 bg-bg px-2 py-1.5 text-sm text-text-primary"
                  />
                )}
              </label>

              <button
                onClick={onSave}
                disabled={saving}
                className="w-full rounded-md bg-teal text-bg font-medium py-2 text-sm hover:bg-teal/90 transition disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save connection"}
              </button>
            </div>
          )}

          {error && <p className="text-xs text-coral">{error}</p>}
        </div>
      )}
    </div>
  );
}
