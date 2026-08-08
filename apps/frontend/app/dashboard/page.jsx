"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import InputPanel from "../../components/InputPanel";
import DiagnosisCard from "../../components/DiagnosisCard";
import DiffViewer from "../../components/DiffViewer";
import CodeFixCard from "../../components/CodeFixCard";
import Timeline from "../../components/Timeline";
import StatsTiles from "../../components/StatsTiles";
import WatchToggle from "../../components/WatchToggle";
import RepoSessions from "../../components/RepoSessions";
import RecentDiagnoses from "../../components/RecentDiagnoses";
import UserBadge from "../../components/UserBadge";
import NotificationBell from "../../components/NotificationBell";
import {
  diagnose,
  applyFix,
  applyCodeFix,
  getStatus,
  getPatternStats,
  getReplay,
  getGithubConnectionContent,
  listWatchNotifications,
  markAllNotificationsSeen,
  getWatchNotification,
} from "../../lib/api";

const STATUS_POLL_MS = 4000;
const NOTIFICATIONS_POLL_MS = 30000;
const USERNAME_KEY = "dd_username";
const AVATAR_KEY = "dd_avatar";

export default function Dashboard() {
  const [loading, setLoading] = useState(false);
  const [diagnosis, setDiagnosis] = useState(null);
  const [originalYaml, setOriginalYaml] = useState("");
  const [events, setEvents] = useState([]);
  const [applying, setApplying] = useState(false);
  const [applyState, setApplyState] = useState(null); // null | "pending" | "success" | "fail" | "stopped"
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [connectedYaml, setConnectedYaml] = useState(undefined); // undefined = not loaded yet
  const [loadingConnectedYaml, setLoadingConnectedYaml] = useState(false);
  const [username, setUsername] = useState(null);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const pollRef = useRef(null);

  const refreshNotifications = useCallback(() => {
    listWatchNotifications()
      .then((r) => setNotifications(r.notifications))
      .catch(() => {});
  }, []);

  // Watch Mode's actual checking now happens server-side (see
  // watchScheduler.js) regardless of whether this tab is open — polling
  // notifications is how an open tab finds out something was caught,
  // instead of the old model where the tab itself had to be the one doing
  // the check.
  useEffect(() => {
    refreshNotifications();
    const interval = setInterval(refreshNotifications, NOTIFICATIONS_POLL_MS);
    return () => clearInterval(interval);
  }, [refreshNotifications]);

  function onNotificationBellOpen() {
    if (notifications.some((n) => !n.seen)) {
      markAllNotificationsSeen()
        .then(refreshNotifications)
        .catch(() => {});
    }
  }

  // Loads a notification's full stored diagnosis into the live panel —
  // the same review-then-decide flow as any other diagnosis, not just a
  // read-only summary.
  async function onSelectNotification(id) {
    try {
      const { notification } = await getWatchNotification(id);
      if (notification.diagnosis) {
        setDiagnosis(notification.diagnosis);
        setOriginalYaml("");
        await refreshEvents(notification.replay_id);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  const stopPolling = useCallback(() => {
    clearInterval(pollRef.current);
    pollRef.current = null;
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  // Landing page's "Continue with GitHub" redirects back here with
  // ?gh_user=&gh_avatar= — pick those up once, persist to localStorage
  // (no server session; this only tags who ran a diagnosis, it never
  // gates anything), then strip them from the URL so a refresh doesn't
  // re-trigger this. Falls back to whatever was already stored.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ghUser = params.get("gh_user");
    const ghError = params.get("gh_error");
    if (ghUser) {
      localStorage.setItem(USERNAME_KEY, ghUser);
      const avatar = params.get("gh_avatar");
      if (avatar) localStorage.setItem(AVATAR_KEY, avatar);
      window.history.replaceState({}, "", window.location.pathname);
      setUsername(ghUser);
      setAvatarUrl(avatar || null);
    } else {
      if (ghError) {
        setError("GitHub sign-in failed — you can still use everything below, just without saved history.");
        window.history.replaceState({}, "", window.location.pathname);
      }
      setUsername(localStorage.getItem(USERNAME_KEY));
      setAvatarUrl(localStorage.getItem(AVATAR_KEY));
    }
  }, []);

  function signOut() {
    localStorage.removeItem(USERNAME_KEY);
    localStorage.removeItem(AVATAR_KEY);
    setUsername(null);
    setAvatarUrl(null);
  }

  // Pulls the connected repo's actual zerops.yaml into the Input panel so
  // the user only has to paste the error log, not the config too. Runs on
  // load and again whenever RepoSessions activates a session; a 404 (no
  // connection yet) is expected and left non-fatal.
  const refreshConnectedYaml = useCallback(async () => {
    setLoadingConnectedYaml(true);
    try {
      const r = await getGithubConnectionContent();
      setConnectedYaml(r.content);
    } catch {
      // no connection yet, or fetch failed — leave the form as-is
    } finally {
      setLoadingConnectedYaml(false);
    }
  }, []);

  useEffect(() => {
    refreshConnectedYaml();
  }, [refreshConnectedYaml]);

  async function runDiagnosis(input) {
    setLoading(true);
    setError(null);
    try {
      // A connected session is a standing signal of intent — "diagnose
      // against this repo" — so default to grounding in it whenever the
      // caller hasn't already decided (Analyze codebase always passes its
      // own true; a manually pasted "Public GitHub repo" URL should win
      // instead of being silently ignored). Without this, plain-English
      // submissions like "go through my codebase" had nothing to look at:
      // that mode never sends yaml/log/sourceFiles on its own, only text.
      const hasConnectedRepo = connectedYaml !== undefined;
      const finalInput = {
        ...input,
        username: username || undefined,
        use_connected_repo:
          input.use_connected_repo !== undefined
            ? input.use_connected_repo
            : hasConnectedRepo && !input.repo_url,
      };
      const result = await diagnose(finalInput);
      setDiagnosis(result);
      setOriginalYaml(finalInput.yaml || (finalInput.use_connected_repo ? connectedYaml || "" : ""));
      await refreshEvents(result.replay_id);
      if (result.pattern_id) {
        getPatternStats(result.pattern_id).then(setStats).catch(() => setStats(null));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function refreshEvents(replayId) {
    try {
      const replay = await getReplay(replayId);
      setEvents(replay.events || []);
    } catch {
      // non-fatal — timeline just stays as-is until the next successful refresh
    }
  }

  // Shared by both commit paths (config's fixed_yaml and code's
  // code_suggestion) so the "did we remember to clear applying on every
  // resolution branch" bug that hit the config path once can't quietly
  // reappear in a second, hand-duplicated copy for code fixes.
  function startRedeployPolling(replayId, { onRetry }) {
    pollRef.current = setInterval(async () => {
      try {
        const status = await getStatus(replayId);
        if (status.events) setEvents(status.events);
        if (status.resolved === "success") {
          setApplyState("success");
          setApplying(false);
          stopPolling();
        } else if (status.resolved === "fail" && status.stopped) {
          setApplyState("stopped");
          setApplying(false);
          stopPolling();
        } else if (status.resolved === "fail") {
          // Retry memory (F2, Level 1): feed the new log back into F1 automatically.
          stopPolling();
          setApplying(false);
          await onRetry(status.new_log);
        }
      } catch {
        // transient poll failure — try again next tick
      }
    }, STATUS_POLL_MS);
  }

  async function onApply() {
    if (!diagnosis?.fixed_yaml || !diagnosis?.replay_id) return;
    setApplying(true);
    setApplyState("pending");
    setError(null);
    try {
      await applyFix({
        replay_id: diagnosis.replay_id,
        fixed_yaml: diagnosis.fixed_yaml,
        pattern_id: diagnosis.pattern_id,
      });
      startRedeployPolling(diagnosis.replay_id, {
        onRetry: async (newLog) => {
          const retried = await diagnose({
            yaml: diagnosis.fixed_yaml,
            log: newLog,
            replay_id: diagnosis.replay_id,
            username: username || undefined,
          });
          setDiagnosis(retried);
          setOriginalYaml(diagnosis.fixed_yaml);
          await refreshEvents(retried.replay_id);
          setApplyState(null);
        },
      });
    } catch (err) {
      setError(err.message);
      setApplyState(null);
      setApplying(false);
    }
  }

  async function onApplyCode() {
    if (!diagnosis?.code_suggestion || !diagnosis?.file_path || !diagnosis?.replay_id) return;
    setApplying(true);
    setApplyState("pending");
    setError(null);
    try {
      await applyCodeFix({
        replay_id: diagnosis.replay_id,
        file_path: diagnosis.file_path,
        code_suggestion: diagnosis.code_suggestion,
        pattern_id: diagnosis.pattern_id,
      });
      startRedeployPolling(diagnosis.replay_id, {
        onRetry: async (newLog) => {
          // Force use_connected_repo (rather than relying on the default)
          // so the retry re-fetches the file's post-commit content, not
          // whatever was cached from before this fix landed.
          const retried = await diagnose({
            log: newLog,
            use_connected_repo: true,
            replay_id: diagnosis.replay_id,
            username: username || undefined,
          });
          setDiagnosis(retried);
          setOriginalYaml("");
          await refreshEvents(retried.replay_id);
          setApplyState(null);
        },
      });
    } catch (err) {
      setError(err.message);
      setApplyState(null);
      setApplying(false);
    }
  }

  return (
    <main className="max-w-7xl mx-auto p-6 space-y-6">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl text-text-primary">DeployDoctor</h1>
          <p className="text-sm text-text-secondary">
            ZCP fixes your deploy for you. DeployDoctor shows you exactly how.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex items-center gap-3">
            <UserBadge username={username} avatarUrl={avatarUrl} onSignOut={signOut} />
            <NotificationBell
              notifications={notifications}
              onOpen={onNotificationBellOpen}
              onSelect={onSelectNotification}
            />
          </div>
          <WatchToggle />
        </div>
      </header>

      <RepoSessions
        username={username}
        onConnected={refreshConnectedYaml}
        onAnalyze={(filePaths) => runDiagnosis({ use_connected_repo: true, file_paths: filePaths })}
        analyzing={loading}
      />

      {username && <RecentDiagnoses username={username} />}

      {error && (
        <div className="rounded-md border border-coral/40 bg-coral/10 text-coral text-sm p-3">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="space-y-3">
          <h2 className="font-display text-sm text-text-secondary uppercase tracking-wide">
            Input
          </h2>
          <InputPanel
            onSubmit={runDiagnosis}
            loading={loading}
            initialYaml={connectedYaml}
            onReloadYaml={connectedYaml !== undefined ? refreshConnectedYaml : undefined}
            reloadingYaml={loadingConnectedYaml}
          />
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-sm text-text-secondary uppercase tracking-wide">
            Diagnosis &amp; fix
          </h2>
          <DiagnosisCard diagnosis={diagnosis} />

          {diagnosis?.error_type === "config" && diagnosis?.fixed_yaml && (
            <div className="space-y-3">
              <DiffViewer before={originalYaml} after={diagnosis.fixed_yaml} />
              <button
                onClick={onApply}
                disabled={applying}
                className="w-full rounded-md bg-teal text-bg font-medium py-2 text-sm hover:bg-teal/90 transition disabled:opacity-50"
              >
                {applying ? "Redeploying…" : "Apply fix and redeploy"}
              </button>
              {applyState === "success" && (
                <p className="text-sm text-teal">Redeploy succeeded — service is healthy.</p>
              )}
              {applyState === "stopped" && (
                <p className="text-sm text-coral">
                  Still failing after 3 automatic attempts — stopping here. Take a look manually.
                </p>
              )}
            </div>
          )}

          {diagnosis?.error_type === "code" && (
            <CodeFixCard
              diagnosis={diagnosis}
              onCommit={diagnosis.original_file_content ? onApplyCode : undefined}
              applying={applying}
              applyState={applyState}
            />
          )}

          {stats && (
            <div className="space-y-2">
              <h3 className="text-xs text-text-muted uppercase tracking-wide">
                Community fix intelligence
              </h3>
              <StatsTiles stats={stats} />
            </div>
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm text-text-secondary uppercase tracking-wide">
              Deploy replay
            </h2>
            {diagnosis?.replay_id && (
              <a
                href={`/replay/${diagnosis.replay_id}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-aiblue hover:underline"
              >
                Share replay ↗
              </a>
            )}
          </div>
          <Timeline events={events} />
        </section>
      </div>
    </main>
  );
}
