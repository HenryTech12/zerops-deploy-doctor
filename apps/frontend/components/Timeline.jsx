"use client";

const DOT_STYLES = {
  fail: "bg-coral",
  success: "bg-teal",
  pending: "bg-amber animate-pulse",
};

export default function Timeline({ events }) {
  if (!events || events.length === 0) {
    return <p className="text-sm text-text-muted">No attempts recorded yet.</p>;
  }

  return (
    <ol className="relative border-l border-white/10 pl-6 space-y-6">
      {events.map((event) => (
        <li key={event.id} className="relative">
          <span
            className={`absolute -left-[29px] top-1 h-3 w-3 rounded-full ${
              DOT_STYLES[event.status] || "bg-text-muted"
            }`}
          />
          <div className="flex items-center gap-2 text-xs text-text-muted font-mono">
            <span>Attempt {event.attempt_n}</span>
            <span>·</span>
            <span>{new Date(event.created_at).toLocaleTimeString()}</span>
            {event.error_type && (
              <span
                className={
                  event.error_type === "code" ? "text-aiblue" : "text-text-secondary"
                }
              >
                {event.error_type}
              </span>
            )}
          </div>
          <p className="text-sm text-text-primary mt-0.5">{event.cause}</p>
          {event.fix_summary && (
            <p className="text-sm text-text-secondary mt-0.5">{event.fix_summary}</p>
          )}
        </li>
      ))}
    </ol>
  );
}
