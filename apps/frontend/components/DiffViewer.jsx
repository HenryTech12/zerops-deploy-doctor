"use client";

import { diffLines } from "diff";

// A proper line-level diff, not a colored <pre> blob: line numbers, syntax
// gutter, add/remove background tint per the design tokens. This is where
// "IDE tool, not chatbox" is won — see build doc §10.
export default function DiffViewer({ before, after }) {
  const parts = diffLines(before || "", after || "");

  let oldLineNo = 1;
  let newLineNo = 1;
  const rows = [];

  for (const part of parts) {
    const lines = part.value.replace(/\n$/, "").split("\n");
    for (const line of lines) {
      if (part.added) {
        rows.push({ type: "add", oldNo: null, newNo: newLineNo++, text: line });
      } else if (part.removed) {
        rows.push({ type: "remove", oldNo: oldLineNo++, newNo: null, text: line });
      } else {
        rows.push({ type: "context", oldNo: oldLineNo++, newNo: newLineNo++, text: line });
      }
    }
  }

  return (
    <div className="rounded-lg border border-white/10 bg-inset overflow-hidden">
      <div className="px-3 py-2 border-b border-white/10 text-xs text-text-secondary font-mono">
        zerops.yaml
      </div>
      <div className="overflow-x-auto max-h-96 font-mono text-xs leading-6">
        {rows.map((row, i) => (
          <div
            key={i}
            className={`flex ${
              row.type === "add"
                ? "diff-line-add"
                : row.type === "remove"
                ? "diff-line-remove"
                : "diff-line-context"
            }`}
          >
            <span className="w-10 shrink-0 text-right pr-2 select-none opacity-50">
              {row.oldNo ?? ""}
            </span>
            <span className="w-10 shrink-0 text-right pr-2 select-none opacity-50">
              {row.newNo ?? ""}
            </span>
            <span className="w-4 shrink-0 select-none">
              {row.type === "add" ? "+" : row.type === "remove" ? "-" : " "}
            </span>
            <span className="whitespace-pre pr-4">{row.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
