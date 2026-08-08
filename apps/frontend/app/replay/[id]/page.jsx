import Link from "next/link";
import Timeline from "../../../components/Timeline";
import { API_URL } from "../../../lib/api";

export const dynamic = "force-dynamic";

async function fetchReplay(id) {
  const res = await fetch(`${API_URL}/api/replay/${id}`, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

export default async function ReplayPage({ params }) {
  const replay = await fetchReplay(params.id);

  if (!replay) {
    return (
      <main className="max-w-2xl mx-auto p-6 text-center">
        <p className="text-text-secondary">Replay not found.</p>
      </main>
    );
  }

  return (
    <main className="max-w-2xl mx-auto p-6 space-y-6">
      <header className="text-center space-y-1">
        <p className="text-xs text-text-muted uppercase tracking-wide">DeployDoctor replay</p>
        <h1 className="font-display text-xl text-text-primary">
          {replay.title || "Deploy diagnosis"}
        </h1>
        <p className="text-xs text-text-muted">
          {new Date(replay.created_at).toLocaleString()}
        </p>
      </header>
      <Timeline events={replay.events} />
      <div className="text-center">
        <Link href="/dashboard" className="text-xs text-aiblue hover:underline">
          ← Back to DeployDoctor
        </Link>
      </div>
    </main>
  );
}
