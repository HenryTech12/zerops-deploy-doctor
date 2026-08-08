"use client";

import { useEffect, useMemo, useState } from "react";
import {
  activateGithubSession,
  createGithubSession,
  deleteGithubSession,
  getGithubAppInfo,
  listGithubRepoBranches,
  listGithubRepoFiles,
  listGithubRepoSourceFiles,
  listGithubRepos,
  listGithubSessions,
  renameGithubSession,
} from "../lib/api";

function GithubMark({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.09 3.29 9.4 7.86 10.93.57.1.79-.25.79-.55 0-.27-.01-1.17-.02-2.12-3.2.7-3.87-1.36-3.87-1.36-.53-1.33-1.29-1.69-1.29-1.69-1.05-.72.08-.7.08-.7 1.17.08 1.78 1.2 1.78 1.2 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.25.45-2.28 1.19-3.08-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.64 1.59.24 2.76.12 3.05.74.8 1.19 1.83 1.19 3.08 0 4.41-2.7 5.38-5.27 5.67.42.36.78 1.07.78 2.15 0 1.55-.01 2.8-.01 3.18 0 .31.21.66.8.55A10.51 10.51 0 0 0 23.5 12c0-6.35-5.15-11.5-11.5-11.5Z" />
    </svg>
  );
}

function ScanMark({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function PencilMark({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function TrashMark({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
  );
}

const MAX_ANALYZE_FILES = 8;
const LIKELY_ENTRYPOINT_RE =
  /^(src\/)?(index|server|app|main|db)\.(js|jsx|ts|tsx|mjs|cjs|py|go|rb|java)$/i;
const PAGE_SIZE = 7;

// F2's real "connect a repo" flow, modeled on Vercel/Render's Git import
// UI, but named: users work across more than one repo, so this is a real
// list of saved, switchable sessions rather than one slot that gets
// silently overwritten every time.
export default function RepoSessions({ username, onConnected, onAnalyze, analyzing }) {
  const [appInfo, setAppInfo] = useState(null);
  const [sessions, setSessions] = useState(null);
  const [sessionsError, setSessionsError] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [step, setStep] = useState("list"); // "list" | "configure"
  const [repos, setRepos] = useState(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState(null);
  const [files, setFiles] = useState([]);
  const [branches, setBranches] = useState([]);
  const [branch, setBranch] = useState("main");
  const [yamlPath, setYamlPath] = useState("zerops.yaml");
  const [sessionName, setSessionName] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [activatingId, setActivatingId] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [rowError, setRowError] = useState(null);

  const [analyzeOpen, setAnalyzeOpen] = useState(false);
  const [sourceFiles, setSourceFiles] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [sourceQuery, setSourceQuery] = useState("");
  const [sourcePage, setSourcePage] = useState(0);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceError, setSourceError] = useState(null);

  const activeSession = sessions?.find((s) => s.is_active) || null;

  function refreshSessions() {
    return listGithubSessions()
      .then((r) => {
        setSessions(r.sessions);
        setSessionsError(null);
      })
      .catch((err) => setSessionsError(err.message));
  }

  useEffect(() => {
    getGithubAppInfo().then(setAppInfo).catch(() => setAppInfo(null));
    refreshSessions();
  }, []);

  function openModal() {
    setStep("list");
    setError(null);
    setModalOpen(true);
    loadRepos();
  }

  async function loadRepos() {
    setLoading(true);
    setError(null);
    try {
      const r = await listGithubRepos();
      setRepos(r.repos);
    } catch (err) {
      setError(err.message);
      setRepos(null);
    } finally {
      setLoading(false);
    }
  }

  // Installing the App happens on GitHub's own tab — auto-retry the repo
  // list when the user comes back to this tab instead of making them find
  // and click "Refresh list" themselves.
  useEffect(() => {
    if (!modalOpen || step !== "list") return;
    function onFocus() {
      loadRepos();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [modalOpen, step]);

  function pickRepo(repo) {
    setSelected(repo);
    setBranch(repo.default_branch || "main");
    setYamlPath("zerops.yaml");
    setSessionName(repo.repo);
    setFiles([]);
    setBranches([]);
    setStep("configure");
    listGithubRepoFiles(repo.owner, repo.repo, repo.default_branch || "main")
      .then((r) => setFiles(r.files))
      .catch(() => setFiles([]));
    listGithubRepoBranches(repo.owner, repo.repo)
      .then((r) => setBranches(r.branches))
      .catch(() => setBranches([]));
  }

  async function onCreateSession() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await createGithubSession({
        name: sessionName,
        owner: selected.owner,
        repo: selected.repo,
        branch,
        yaml_path: yamlPath,
        username: username || undefined,
      });
      await refreshSessions();
      setModalOpen(false);
      onConnected?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function onSetActive(id) {
    setActivatingId(id);
    setRowError(null);
    try {
      await activateGithubSession(id);
      await refreshSessions();
      onConnected?.();
    } catch (err) {
      setRowError(err.message);
    } finally {
      setActivatingId(null);
    }
  }

  function startRename(session) {
    setRenamingId(session.id);
    setRenameValue(session.name);
    setRowError(null);
  }

  async function saveRename(id) {
    setRowError(null);
    try {
      await renameGithubSession(id, renameValue);
      setRenamingId(null);
      await refreshSessions();
    } catch (err) {
      setRowError(err.message);
    }
  }

  async function onDelete(id) {
    setRowError(null);
    try {
      await deleteGithubSession(id);
      setConfirmDeleteId(null);
      await refreshSessions();
      onConnected?.();
    } catch (err) {
      setRowError(err.message);
    }
  }

  function openAnalyze() {
    if (!activeSession) return;
    setAnalyzeOpen(true);
    setSourceQuery("");
    setSourcePage(0);
    setSelectedFiles([]);
    setSourceError(null);
    setSourceLoading(true);
    listGithubRepoSourceFiles(activeSession.owner, activeSession.repo, activeSession.branch)
      .then((r) => setSourceFiles(r.files))
      .catch((err) => {
        setSourceError(err.message);
        setSourceFiles(null);
      })
      .finally(() => setSourceLoading(false));
  }

  function toggleFile(path) {
    setSelectedFiles((prev) =>
      prev.includes(path)
        ? prev.filter((p) => p !== path)
        : prev.length < MAX_ANALYZE_FILES
        ? [...prev, path]
        : prev
    );
  }

  function selectLikelyEntrypoints() {
    if (!sourceFiles) return;
    setSelectedFiles(sourceFiles.filter((f) => LIKELY_ENTRYPOINT_RE.test(f)).slice(0, MAX_ANALYZE_FILES));
  }

  function submitAnalyze(filePaths) {
    setAnalyzeOpen(false);
    onAnalyze?.(filePaths);
  }

  const filteredRepos = useMemo(() => {
    if (!repos) return null;
    const q = query.trim().toLowerCase();
    if (!q) return repos;
    return repos.filter((r) => r.full_name.toLowerCase().includes(q));
  }, [repos, query]);

  useEffect(() => {
    setPage(0);
  }, [query, repos]);

  const pageCount = filteredRepos ? Math.max(1, Math.ceil(filteredRepos.length / PAGE_SIZE)) : 1;
  const pagedRepos = filteredRepos ? filteredRepos.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE) : null;

  const filteredSourceFiles = useMemo(() => {
    if (!sourceFiles) return null;
    const q = sourceQuery.trim().toLowerCase();
    if (!q) return sourceFiles;
    return sourceFiles.filter((f) => f.toLowerCase().includes(q));
  }, [sourceFiles, sourceQuery]);

  useEffect(() => {
    setSourcePage(0);
  }, [sourceQuery, sourceFiles]);

  const sourcePageCount = filteredSourceFiles
    ? Math.max(1, Math.ceil(filteredSourceFiles.length / PAGE_SIZE))
    : 1;
  const pagedSourceFiles = filteredSourceFiles
    ? filteredSourceFiles.slice(sourcePage * PAGE_SIZE, sourcePage * PAGE_SIZE + PAGE_SIZE)
    : null;

  const noInstallation = Boolean(error && error.toLowerCase().includes("no installations"));

  return (
    <>
      <div className="rounded-lg border border-white/10 bg-panel p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm text-text-primary font-medium">
            Repo sessions
            {sessions && sessions.length > 0 && (
              <span className="text-text-muted font-normal"> ({sessions.length})</span>
            )}
          </h2>
          <button
            onClick={openModal}
            className="shrink-0 flex items-center gap-1.5 rounded-md bg-teal text-bg text-xs font-medium px-3 py-1.5 hover:bg-teal/90 transition"
          >
            + New session
          </button>
        </div>

        {sessionsError && <p className="text-xs text-coral">{sessionsError}</p>}
        {rowError && <p className="text-xs text-coral">{rowError}</p>}

        {sessions && sessions.length === 0 && (
          <div className="text-center py-6 space-y-2">
            <GithubMark className="h-7 w-7 mx-auto text-text-muted" />
            <p className="text-sm text-text-secondary">No repo sessions yet</p>
            <p className="text-xs text-text-muted">
              Apply-fix and Analyze codebase need a session to work against.
            </p>
          </div>
        )}

        {sessions && sessions.length > 0 && (
          <ul className="divide-y divide-white/10 -mx-4 px-4">
            {sessions.map((s) => (
              <li key={s.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-start gap-3">
                  <GithubMark className="h-4 w-4 text-text-secondary shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    {renamingId === s.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveRename(s.id);
                            if (e.key === "Escape") setRenamingId(null);
                          }}
                          className="flex-1 rounded-md border border-teal/40 bg-bg px-2 py-1 text-sm text-text-primary"
                        />
                        <button
                          onClick={() => saveRename(s.id)}
                          className="text-xs text-teal font-medium shrink-0"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setRenamingId(null)}
                          className="text-xs text-text-muted shrink-0"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm text-text-primary font-medium truncate">{s.name}</span>
                        {s.is_active && (
                          <span className="shrink-0 rounded-full bg-teal/10 text-teal text-[10px] font-medium px-2 py-0.5">
                            Active
                          </span>
                        )}
                      </div>
                    )}
                    <p className="text-xs text-text-muted truncate mt-0.5">
                      {s.owner}/{s.repo} — {s.branch} — {s.yaml_path}
                    </p>

                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      {s.is_active ? (
                        <button
                          onClick={openAnalyze}
                          disabled={analyzing}
                          className="flex items-center gap-1.5 rounded-md bg-teal/10 border border-teal/30 text-teal px-2.5 py-1 text-xs font-medium hover:bg-teal/20 transition disabled:opacity-50"
                        >
                          <ScanMark className="h-3.5 w-3.5" />
                          {analyzing ? "Analyzing…" : "Analyze codebase"}
                        </button>
                      ) : (
                        <button
                          onClick={() => onSetActive(s.id)}
                          disabled={activatingId === s.id}
                          className="rounded-md border border-white/10 px-2.5 py-1 text-xs text-text-secondary hover:text-text-primary hover:border-white/20 transition disabled:opacity-50"
                        >
                          {activatingId === s.id ? "Switching…" : "Set active"}
                        </button>
                      )}
                      <button
                        onClick={() => startRename(s)}
                        className="text-text-muted hover:text-text-primary transition"
                        aria-label="Rename session"
                        title="Rename"
                      >
                        <PencilMark className="h-3.5 w-3.5" />
                      </button>
                      {confirmDeleteId === s.id ? (
                        <span className="flex items-center gap-2 text-xs">
                          <span className="text-text-muted">Delete?</span>
                          <button onClick={() => onDelete(s.id)} className="text-coral font-medium">
                            Yes
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="text-text-muted"
                          >
                            No
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(s.id)}
                          className="text-text-muted hover:text-coral transition"
                          aria-label="Delete session"
                          title="Delete"
                        >
                          <TrashMark className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-lg border border-white/10 bg-panel shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <h3 className="font-display text-sm text-text-primary">
                {step === "list" ? "Import Git Repository" : "New session"}
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="text-text-muted hover:text-text-primary text-sm"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {step === "list" && noInstallation && (
              <div className="p-6 space-y-4 text-center">
                <GithubMark className="h-8 w-8 mx-auto text-text-secondary" />
                <div>
                  <p className="text-sm text-text-primary">
                    Step 1: install {appInfo?.name || "the GitHub App"} on a repo
                  </p>
                  <p className="text-xs text-text-muted mt-1">
                    Nothing to import yet. Click below, choose the repo(s) you want DeployDoctor to
                    fix, then come back to this tab — the list refreshes automatically.
                  </p>
                </div>
                {appInfo && (
                  <a
                    href={appInfo.install_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-md bg-teal text-bg text-sm font-medium px-4 py-2 hover:bg-teal/90 transition"
                  >
                    <GithubMark className="h-4 w-4" />
                    Install on GitHub ↗
                  </a>
                )}
                <button
                  onClick={loadRepos}
                  disabled={loading}
                  className="block mx-auto text-xs text-aiblue hover:underline disabled:opacity-50"
                >
                  {loading ? "Checking…" : "Already installed it — refresh"}
                </button>
              </div>
            )}

            {step === "list" && !noInstallation && (
              <div className="p-4 space-y-3">
                {appInfo && (
                  <a
                    href={appInfo.install_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-2 w-full rounded-md border border-white/10 bg-bg px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:border-white/20 transition"
                  >
                    <GithubMark className="h-4 w-4" />
                    Install / manage {appInfo.name} on GitHub ↗
                  </a>
                )}

                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search repositories…"
                  className="w-full rounded-md border border-white/10 bg-bg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted"
                />

                <div className="max-h-80 overflow-y-auto rounded-md border border-white/10 divide-y divide-white/10">
                  {loading && (
                    <p className="p-4 text-xs text-text-muted text-center">Loading repositories…</p>
                  )}

                  {!loading && filteredRepos && filteredRepos.length === 0 && (
                    <p className="p-4 text-xs text-amber text-center">
                      No repositories match — install the App on more repos above, or adjust your
                      search.
                    </p>
                  )}

                  {!loading &&
                    pagedRepos &&
                    pagedRepos.map((r) => (
                      <button
                        key={r.full_name}
                        onClick={() => pickRepo(r)}
                        className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-white/5 transition"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <GithubMark className="h-4 w-4 text-text-muted shrink-0" />
                          <span className="text-sm text-text-primary truncate">{r.full_name}</span>
                          {r.private && (
                            <span className="shrink-0 rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-text-muted">
                              Private
                            </span>
                          )}
                        </div>
                        <span className="shrink-0 rounded-md bg-teal/10 text-teal text-xs px-2 py-1">
                          Select
                        </span>
                      </button>
                    ))}
                </div>

                <div className="flex items-center justify-between">
                  <button
                    onClick={loadRepos}
                    disabled={loading}
                    className="text-xs text-aiblue hover:underline disabled:opacity-50"
                  >
                    Refresh list
                  </button>

                  {filteredRepos && filteredRepos.length > PAGE_SIZE && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                        disabled={page === 0}
                        className="rounded border border-white/10 px-2 py-1 text-xs text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:hover:text-text-secondary transition"
                        aria-label="Previous page"
                      >
                        ←
                      </button>
                      <span className="text-xs text-text-muted">
                        Page {page + 1} of {pageCount}
                      </span>
                      <button
                        onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                        disabled={page >= pageCount - 1}
                        className="rounded border border-white/10 px-2 py-1 text-xs text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:hover:text-text-secondary transition"
                        aria-label="Next page"
                      >
                        →
                      </button>
                    </div>
                  )}
                </div>

                {error && <p className="text-xs text-coral">{error}</p>}
              </div>
            )}

            {step === "configure" && selected && (
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-2 rounded-md border border-white/10 bg-bg px-3 py-2">
                  <GithubMark className="h-4 w-4 text-text-secondary" />
                  <span className="text-sm text-text-primary">{selected.full_name}</span>
                </div>

                <label className="block text-xs text-text-muted">
                  Session name
                  <input
                    value={sessionName}
                    onChange={(e) => setSessionName(e.target.value)}
                    placeholder="e.g. Patient app"
                    maxLength={60}
                    className="mt-1 w-full rounded-md border border-white/10 bg-bg px-2 py-1.5 text-sm text-text-primary"
                  />
                </label>

                <label className="block text-xs text-text-muted">
                  Branch
                  {branches.length > 0 ? (
                    <select
                      value={branch}
                      onChange={(e) => {
                        const newBranch = e.target.value;
                        setBranch(newBranch);
                        setFiles([]);
                        listGithubRepoFiles(selected.owner, selected.repo, newBranch)
                          .then((r) => setFiles(r.files))
                          .catch(() => setFiles([]));
                      }}
                      className="mt-1 w-full rounded-md border border-white/10 bg-bg px-2 py-1.5 text-sm text-text-primary"
                    >
                      {branches.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={branch}
                      onChange={(e) => setBranch(e.target.value)}
                      placeholder="Loading branches…"
                      className="mt-1 w-full rounded-md border border-white/10 bg-bg px-2 py-1.5 text-sm text-text-primary"
                    />
                  )}
                </label>

                <label className="block text-xs text-text-muted">
                  Config file to fix
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
                  <span className="block text-[11px] text-text-muted mt-1 normal-case">
                    Only this file gets committed by Apply Fix. To scan or pick from your source
                    code, use "Analyze codebase" after creating the session — every diagnosis also
                    pulls from this repo automatically once it's active.
                  </span>
                </label>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => setStep("list")}
                    className="rounded-md border border-white/10 px-3 py-2 text-xs text-text-secondary hover:text-text-primary transition"
                  >
                    Back
                  </button>
                  <button
                    onClick={onCreateSession}
                    disabled={saving || !sessionName.trim()}
                    className="flex-1 rounded-md bg-teal text-bg font-medium py-2 text-sm hover:bg-teal/90 transition disabled:opacity-50"
                  >
                    {saving ? "Creating…" : "Create session"}
                  </button>
                </div>

                {error && <p className="text-xs text-coral">{error}</p>}
              </div>
            )}
          </div>
        </div>
      )}

      {analyzeOpen && activeSession && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setAnalyzeOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-lg border border-white/10 bg-panel shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div>
                <h3 className="font-display text-sm text-text-primary">Analyze codebase</h3>
                <p className="text-xs text-text-muted mt-0.5">
                  {activeSession.owner}/{activeSession.repo} @ {activeSession.branch}
                </p>
              </div>
              <button
                onClick={() => setAnalyzeOpen(false)}
                className="text-text-muted hover:text-text-primary text-sm"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-3">
              <p className="text-xs text-text-muted">
                Pick up to {MAX_ANALYZE_FILES} files to scan — no pasted error needed, the LLM will
                look for the most likely bug or misconfiguration across what you select.
              </p>

              <div className="flex items-center gap-2">
                <input
                  value={sourceQuery}
                  onChange={(e) => setSourceQuery(e.target.value)}
                  placeholder="Search files…"
                  className="flex-1 rounded-md border border-white/10 bg-bg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted"
                />
                <button
                  onClick={selectLikelyEntrypoints}
                  disabled={!sourceFiles}
                  className="shrink-0 rounded-md border border-white/10 px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:border-white/20 transition disabled:opacity-50"
                >
                  Auto-select
                </button>
              </div>

              <div className="max-h-72 overflow-y-auto rounded-md border border-white/10 divide-y divide-white/10">
                {sourceLoading && (
                  <p className="p-4 text-xs text-text-muted text-center">Loading files…</p>
                )}

                {!sourceLoading && sourceError && (
                  <p className="p-4 text-xs text-coral text-center">{sourceError}</p>
                )}

                {!sourceLoading && filteredSourceFiles && filteredSourceFiles.length === 0 && (
                  <p className="p-4 text-xs text-amber text-center">No source files match.</p>
                )}

                {!sourceLoading &&
                  pagedSourceFiles &&
                  pagedSourceFiles.map((f) => {
                    const checked = selectedFiles.includes(f);
                    const disabled = !checked && selectedFiles.length >= MAX_ANALYZE_FILES;
                    return (
                      <label
                        key={f}
                        className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-white/5 transition ${
                          disabled ? "opacity-40 cursor-not-allowed" : ""
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => toggleFile(f)}
                          className="accent-teal shrink-0"
                        />
                        <span className="text-sm text-text-primary font-mono text-xs truncate">{f}</span>
                      </label>
                    );
                  })}
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-text-muted">
                  {selectedFiles.length}/{MAX_ANALYZE_FILES} selected
                </span>

                {filteredSourceFiles && filteredSourceFiles.length > PAGE_SIZE && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSourcePage((p) => Math.max(0, p - 1))}
                      disabled={sourcePage === 0}
                      className="rounded border border-white/10 px-2 py-1 text-xs text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:hover:text-text-secondary transition"
                      aria-label="Previous page"
                    >
                      ←
                    </button>
                    <span className="text-xs text-text-muted">
                      Page {sourcePage + 1} of {sourcePageCount}
                    </span>
                    <button
                      onClick={() => setSourcePage((p) => Math.min(sourcePageCount - 1, p + 1))}
                      disabled={sourcePage >= sourcePageCount - 1}
                      className="rounded border border-white/10 px-2 py-1 text-xs text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:hover:text-text-secondary transition"
                      aria-label="Next page"
                    >
                      →
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => submitAnalyze(undefined)}
                  className="rounded-md border border-white/10 px-3 py-2 text-xs text-text-secondary hover:text-text-primary transition"
                  title="Let DeployDoctor guess likely entrypoint files instead of picking your own"
                >
                  Auto-detect for me
                </button>
                <button
                  onClick={() => submitAnalyze(selectedFiles)}
                  disabled={selectedFiles.length === 0}
                  className="flex-1 rounded-md bg-teal text-bg font-medium py-2 text-sm hover:bg-teal/90 transition disabled:opacity-50"
                >
                  Analyze {selectedFiles.length > 0 ? `${selectedFiles.length} file${selectedFiles.length > 1 ? "s" : ""}` : "selected files"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
