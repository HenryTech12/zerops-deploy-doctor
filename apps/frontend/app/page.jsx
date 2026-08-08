import Link from "next/link";
import { API_URL } from "../lib/api";

const PAIN_POINTS = [
  {
    title: "Cryptic errors, no context",
    body: "A generic “502” or a wall of build logs doesn't tell you which line of your zerops.yaml — or your code — actually caused it.",
  },
  {
    title: "Config bugs and code bugs need different fixes",
    body: "A missing httpSupport flag and a null-pointer bug aren't the same problem. Most tools treat every failure the same way.",
  },
  {
    title: "Tab-switching while your app is down",
    body: "Dashboard, docs, GitHub, terminal, repeat — every minute spent context-switching is a minute your deploy stays broken.",
  },
];

const CORE_LOOP = [
  "Connect a repo, paste a zerops.yaml + log, describe the problem in plain English — or flip on Watch Mode and let DeployDoctor catch failures by itself.",
  "A rules engine plus an LLM (Groq, gpt-oss) diagnose the real root cause.",
  "Config error → review the exact diff → click Apply → committed straight to your repo → Zerops redeploys → status polled until healthy.",
  "Code error → DeployDoctor points at the exact file and line with a copy-paste fix, never writing to your repo.",
  "Every cycle lands on a public, shareable Deploy Replay Timeline.",
  "Every fix teaches — a next-time tip, honest community stats, and memory of what didn't work.",
];

const FEATURES = [
  { code: "F1", title: "AI diagnosis", body: "Rules engine + Groq (gpt-oss) find the real root cause, not just the symptom.", tag: "core" },
  { code: "F2", title: "Auto-fix, with your approval", body: "Diff review, one-click apply, automatic retry with memory of what already failed, capped at 3 attempts.", tag: "core" },
  { code: "F3", title: "Natural-language input", body: "“My API isn't reachable” works as well as a pasted log.", tag: null },
  { code: "F4", title: "Learning Mode", body: "Every diagnosis ships a next-time tip and a difficulty rating, so the fix teaches something.", tag: null },
  { code: "F5", title: "Community Fix Intelligence", body: "Real seen/fixed counts and average fix time — honest numbers, never fabricated.", tag: null },
  { code: "F6", title: "Deploy Replay Timeline", body: "Every diagnose → fix → redeploy cycle on a public, shareable URL.", tag: "signature" },
  { code: "F7", title: "Code error diagnosis", body: "Points at the exact file and line, or scans your connected repo directly — always copy-paste, never auto-applied.", tag: null },
  { code: "F8", title: "Watch Mode", body: "A real background job checks runtime logs continuously and notifies you the moment something breaks — no tab required.", tag: null },
  { code: "F9", title: "Learns from failed fixes", body: "A fix that didn't work is remembered, so it's never suggested the same way twice.", tag: null },
];

export default function Landing() {
  return (
    <main className="min-h-screen px-6 py-16">
      <div className="max-w-2xl mx-auto text-center space-y-4">
        <p className="text-xs uppercase tracking-widest text-teal font-mono">
          for Zerops deployments
        </p>
        <h1 className="font-display text-4xl sm:text-5xl text-text-primary">DeployDoctor</h1>
        <p className="text-base text-text-secondary max-w-lg mx-auto">
          ZCP fixes your deploy for you. DeployDoctor shows you exactly how — diagnose, review, and
          apply the fix, without leaving your browser.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
          <a
            href={`${API_URL}/api/auth/github/login`}
            className="w-full sm:w-auto rounded-md bg-teal text-bg font-medium px-6 py-3 text-sm hover:bg-teal/90 transition"
          >
            Continue with GitHub
          </a>
          <Link
            href="/dashboard"
            className="w-full sm:w-auto rounded-md border border-white/10 text-text-secondary px-6 py-3 text-sm hover:text-text-primary hover:border-white/20 transition"
          >
            Skip — use it without signing in
          </Link>
        </div>
        <p className="text-xs text-text-muted">
          Signing in just saves your diagnosis history under your GitHub username — everything works
          fully signed-out too.
        </p>
      </div>

      {/* Problem statement */}
      <div className="max-w-4xl mx-auto mt-24">
        <p className="text-xs uppercase tracking-widest text-coral font-mono text-center">
          the problem
        </p>
        <h2 className="font-display text-2xl sm:text-3xl text-text-primary text-center mt-2">
          A deploy just broke. Now what?
        </h2>
        <p className="text-sm text-text-secondary text-center max-w-xl mx-auto mt-3">
          Zerops handles the deploy — it doesn't tell you why it failed, or fix it for you. That gap
          is where every minute of downtime actually happens.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8">
          {PAIN_POINTS.map((p) => (
            <div key={p.title} className="rounded-lg border border-coral/20 bg-coral/5 p-4">
              <p className="text-sm text-text-primary font-medium">{p.title}</p>
              <p className="text-xs text-text-secondary mt-1.5">{p.body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Scope boundary callout */}
      <div className="max-w-2xl mx-auto mt-16 rounded-lg border border-teal/30 bg-teal/5 p-6 text-center">
        <p className="text-xs uppercase tracking-widest text-teal font-mono">the approach</p>
        <p className="font-display text-lg sm:text-xl text-text-primary mt-2">
          Auto-fix what the tool owns. Advise on what you own.
        </p>
        <p className="text-sm text-text-secondary mt-2 max-w-lg mx-auto">
          Config errors get a diff and a one-click apply-and-redeploy. Code errors get a copy-paste
          fix you apply yourself — DeployDoctor never writes to your application source. Nothing
          deploys without an explicit click.
        </p>
      </div>

      {/* Core loop */}
      <div className="max-w-2xl mx-auto mt-16">
        <p className="text-xs uppercase tracking-widest text-aiblue font-mono text-center">
          how it works
        </p>
        <h2 className="font-display text-2xl text-text-primary text-center mt-2">The core loop</h2>

        <ol className="mt-8 space-y-4">
          {CORE_LOOP.map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="shrink-0 flex items-center justify-center h-6 w-6 rounded-full bg-aiblue/10 text-aiblue text-xs font-medium mt-0.5">
                {i + 1}
              </span>
              <p className="text-sm text-text-secondary">{step}</p>
            </li>
          ))}
        </ol>
      </div>

      {/* Features */}
      <div className="max-w-4xl mx-auto mt-16">
        <p className="text-xs uppercase tracking-widest text-teal font-mono text-center">
          what's built
        </p>
        <h2 className="font-display text-2xl text-text-primary text-center mt-2">
          Nine features, all live — nothing mocked
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8">
          {FEATURES.map((f) => (
            <div key={f.code} className="rounded-lg border border-white/10 bg-panel p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-mono text-text-muted">{f.code}</span>
                {f.tag && (
                  <span
                    className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
                      f.tag === "signature" ? "text-amber bg-amber/10" : "text-teal bg-teal/10"
                    }`}
                  >
                    {f.tag}
                  </span>
                )}
              </div>
              <p className="text-sm text-text-primary font-medium mt-1.5">{f.title}</p>
              <p className="text-xs text-text-secondary mt-1">{f.body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Built for real */}
      <div className="max-w-2xl mx-auto mt-16 text-center">
        <p className="text-xs uppercase tracking-widest text-text-muted font-mono">
          built for the Zerops Challenge
        </p>
        <p className="text-sm text-text-secondary mt-2">
          Three live Zerops services (frontend, api, managed Postgres) diagnosing a real, separate
          patient-app project over the actual Zerops platform API — not a demo against fixtures.
        </p>
      </div>

      <div className="max-w-2xl mx-auto mt-12 text-center">
        <a
          href={`${API_URL}/api/auth/github/login`}
          className="inline-block rounded-md bg-teal text-bg font-medium px-6 py-3 text-sm hover:bg-teal/90 transition"
        >
          Continue with GitHub
        </a>
      </div>
    </main>
  );
}
