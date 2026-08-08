import Link from "next/link";
import { API_URL } from "../lib/api";

const FEATURES = [
  {
    title: "Diagnose in seconds",
    body: "Paste your zerops.yaml and error log — or connect a repo and let DeployDoctor scan it directly.",
  },
  {
    title: "Auto-fix, with your approval",
    body: "Review the exact diff before anything gets committed. DeployDoctor never pushes without a click.",
  },
  {
    title: "Learn from every deploy",
    body: "Community fix intelligence and a shareable replay timeline turn one fix into a lesson for everyone.",
  },
];

export default function Landing() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-16">
      <div className="max-w-2xl w-full text-center space-y-4">
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl w-full mt-16">
        {FEATURES.map((f) => (
          <div key={f.title} className="rounded-lg border border-white/10 bg-panel p-4 text-left">
            <p className="text-sm text-text-primary font-medium">{f.title}</p>
            <p className="text-xs text-text-secondary mt-1.5">{f.body}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
