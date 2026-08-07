"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import InputPanel from "../components/InputPanel";
import DiagnosisCard from "../components/DiagnosisCard";
import DiffViewer from "../components/DiffViewer";
import CodeFixCard from "../components/CodeFixCard";
import Timeline from "../components/Timeline";
import StatsTiles from "../components/StatsTiles";
import WatchToggle from "../components/WatchToggle";
import ConnectRepo from "../components/ConnectRepo";
import { diagnose, applyFix, getStatus, getPatternStats, getReplay } from "../lib/api";

const STATUS_POLL_MS = 4000;

export default function Dashboard() {
  const [loading, setLoading] = useState(false);
  const [diagnosis, setDiagnosis] = useState(null);
  const [originalYaml, setOriginalYaml] = useState("");
  const [events, setEvents] = useState([]);
  const [applying, setApplying] = useState(false);
  const [applyState, setApplyState] = useState(null); // null | "pending" | "success" | "fail" | "stopped"
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);

  const stopPolling = useCallback(() => {
    clearInterval(pollRef.current);
    pollRef.current = null;
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  async function runDiagnosis(input) {
    setLoading(true);
    setError(null);
    try {
      const result = await diagnose(input);
      setDiagnosis(result);
      setOriginalYaml(input.yaml || "");
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

  async function onWatchCaught(result) {
    setDiagnosis(result);
    setOriginalYaml("");
    await refreshEvents(result.replay_id);
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
      pollRef.current = setInterval(async () => {
        try {
          const status = await getStatus(diagnosis.replay_id);
          if (status.events) setEvents(status.events);
          if (status.resolved === "success") {
            setApplyState("success");
            stopPolling();
          } else if (status.resolved === "fail" && status.stopped) {
            setApplyState("stopped");
            stopPolling();
          } else if (status.resolved === "fail") {
            // Retry memory (F2, Level 1): feed the new log back into F1 automatically.
            stopPolling();
            setApplying(false);
            const retried = await diagnose({
              yaml: diagnosis.fixed_yaml,
              log: status.new_log,
              replay_id: diagnosis.replay_id,
            });
            setDiagnosis(retried);
            setOriginalYaml(diagnosis.fixed_yaml);
            await refreshEvents(retried.replay_id);
            setApplyState(null);
          }
        } catch {
          // transient poll failure — try again next tick
        }
      }, STATUS_POLL_MS);
    } catch (err) {
      setError(err.message);
      setApplyState(null);
      setApplying(false);
    }
  }

  return (
    <main className="max-w-7xl mx-auto p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl text-text-primary">DeployDoctor</h1>
          <p className="text-sm text-text-secondary">
            ZCP fixes your deploy for you. DeployDoctor shows you exactly how.
          </p>
        </div>
        <WatchToggle onCaught={onWatchCaught} />
      </header>

      <ConnectRepo />

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
          <InputPanel onSubmit={runDiagnosis} loading={loading} />
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
            <CodeFixCard filePath={diagnosis.file_path} codeSuggestion={diagnosis.code_suggestion} />
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
