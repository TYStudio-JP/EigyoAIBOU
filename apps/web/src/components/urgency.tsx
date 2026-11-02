export function UrgencyPill({ urgency }: { urgency: "overdue" | "due" | "soon" | "fresh" }) {
  const m = {
    overdue: ["超過", "bg-red-50 text-red-700 border-red-200"],
    due: ["今日", "bg-amber-50 text-amber-800 border-amber-200"],
    soon: ["近日", "bg-blue-50 text-blue-700 border-blue-200"],
    fresh: ["様子見", "bg-gray-50 text-gray-600 border-gray-200"],
  }[urgency];
  return <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[11px] font-semibold ${m[1]}`}>{m[0]}</span>;
}
