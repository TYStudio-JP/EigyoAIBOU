import type { DealStatus } from "@eigyo/core/shared";
import { DEAL_STATUS_LABEL } from "@eigyo/core/shared";

export function DealStatusBadge({ status }: { status: DealStatus }) {
  const c = {
    inquiry: "bg-purple-50 text-purple-700", quoting: "bg-gray-100 text-gray-700", submitted: "bg-blue-50 text-blue-700", tracking: "bg-amber-50 text-amber-700",
    won: "bg-green-50 text-green-700", lost: "bg-red-50 text-red-700", dormant: "bg-gray-50 text-gray-500",
  }[status];
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${c}`}>{DEAL_STATUS_LABEL[status]}</span>;
}
