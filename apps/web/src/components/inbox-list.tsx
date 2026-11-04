import Link from "next/link";
import type { InboxItem } from "@eigyo/core/shared";
import { Empty } from "./ui";
import { yen } from "@/lib/format";

const TONE: Record<InboxItem["kind"], string> = {
  call_open: "bg-amber-50 text-amber-800 border-amber-200",
  call_needs_human: "bg-blue-50 text-blue-700 border-blue-200",
  inquiry_open: "bg-orange-50 text-orange-800 border-orange-200",
  provisional: "bg-amber-100 text-amber-900 border-amber-300",
  quote_draft: "bg-gray-100 text-gray-700 border-gray-200",
  delivery_waiting: "bg-purple-50 text-purple-700 border-purple-200",
  followup: "bg-red-50 text-red-700 border-red-200",
};

/** 返事待ちの一覧（サーバーコンポーネント）。各行に「あと何をすれば返せるか」と次アクション 1 つ。 */
export function InboxList({ items, compact = false }: { items: InboxItem[]; compact?: boolean }) {
  if (items.length === 0) return <Empty>返事待ちなし</Empty>;
  return (
    <ul className="divide-y divide-line">
      {items.map((it, i) => (
        <li key={`${it.kind}-${it.url}-${i}`}>
          <Link href={it.url} className="flex items-start gap-3 py-2.5 active:bg-bg">
            <span className={`shrink-0 mt-0.5 rounded border px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap ${TONE[it.kind]}`}>{it.label}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{it.customer}<span className="text-muted font-normal">　{it.title}</span></div>
              {!compact && <div className="text-xs text-muted truncate">→ {it.todo}</div>}
            </div>
            <div className="shrink-0 text-right">
              <div className="text-xs text-muted num">{it.days === 0 ? "今日" : `${it.days}日`}</div>
              {it.amount != null && it.amount > 0 && <div className="text-xs num">{yen(it.amount)}</div>}
              <div className="text-[11px] text-brand font-semibold mt-0.5">{it.action} →</div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
