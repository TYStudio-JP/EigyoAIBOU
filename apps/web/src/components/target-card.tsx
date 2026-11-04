import Link from "next/link";
import type { TargetProgress } from "@eigyo/core/shared";
import { Card } from "./ui";
import { yen } from "@/lib/format";

function Bar({ pct, tone }: { pct: number | null; tone: string }) {
  return <div className="h-2 bg-bg rounded"><div className={`h-2 rounded ${tone}`} style={{ width: `${Math.min(100, Math.max(0, pct ?? 0))}%` }} /></div>;
}

/** 今月の目標と実績（ダッシュボード）。目標未設定なら設定への導線だけ。 */
export function TargetCard({ p }: { p: TargetProgress }) {
  const month = `${p.month.slice(0, 4)}年${Number(p.month.slice(5, 7))}月`;
  if (p.target_sales == null && p.target_margin == null) {
    return (
      <Card title={`${month}の目標`} action={<Link href="/settings#users" className="text-xs text-brand hover:underline">設定</Link>}>
        <p className="text-sm">今月の受注 <span className="num">{yen(p.won_sales)}</span>　粗利 <span className="num">{yen(p.won_margin)}</span>　{p.won_count} 件</p>
      </Card>
    );
  }
  const firstReach = p.candidates.findIndex((c) => c.reaches_sales);
  return (
    <Card title={`${month}の目標　残り ${p.days_left} 日`} action={<Link href="/settings#users" className="text-xs text-brand hover:underline">変更</Link>}>
      <div className="grid sm:grid-cols-2 gap-4 text-sm">
        {p.target_sales != null && (
          <div>
            <div className="flex justify-between"><span className="text-muted text-xs">売上</span><span className="num text-xs">{yen(p.won_sales)} / {yen(p.target_sales)}</span></div>
            <Bar pct={p.pct_sales} tone={(p.pct_sales ?? 0) >= 100 ? "bg-ok" : (p.pct_sales ?? 0) >= 70 ? "bg-brand" : "bg-accent"} />
            <div className="mt-1 num"><b className={(p.gap_sales ?? 0) <= 0 ? "text-ok" : ""}>{(p.gap_sales ?? 0) <= 0 ? "達成" : `あと ${yen(p.gap_sales)}`}</b><span className="text-muted text-xs">　達成率 {p.pct_sales}%</span></div>
          </div>
        )}
        {p.target_margin != null && (
          <div>
            <div className="flex justify-between"><span className="text-muted text-xs">粗利</span><span className="num text-xs">{yen(p.won_margin)} / {yen(p.target_margin)}</span></div>
            <Bar pct={p.pct_margin} tone={(p.pct_margin ?? 0) >= 100 ? "bg-ok" : (p.pct_margin ?? 0) >= 70 ? "bg-brand" : "bg-accent"} />
            <div className="mt-1 num"><b className={(p.gap_margin ?? 0) <= 0 ? "text-ok" : ""}>{(p.gap_margin ?? 0) <= 0 ? "達成" : `あと ${yen(p.gap_margin)}`}</b><span className="text-muted text-xs">　達成率 {p.pct_margin}%</span></div>
          </div>
        )}
      </div>
      <div className="mt-3 text-xs text-muted num">未決着 {p.candidates.length} 件・{yen(p.open_sales)}{p.needed_count === 0 ? "　達成済み" : p.needed_count ? `　あと ${p.needed_count} 件で達成` : p.target_sales != null ? "　全受注でも未達" : ""}</div>
      {p.candidates.length > 0 && (
        <ul className="mt-2 divide-y divide-line">
          {p.candidates.slice(0, firstReach >= 0 ? Math.max(firstReach + 1, 3) : 5).map((c, i) => (
            <li key={c.quote_id} className={`py-1.5 flex items-center gap-2 text-sm min-w-0 ${c.reaches_sales && i === firstReach ? "bg-green-50 -mx-2 px-2 rounded" : ""}`}>
              <span className="text-xs text-muted num w-4 shrink-0">{i + 1}</span>
              <Link href={`/quotes/${c.quote_id}`} className="flex-1 min-w-0 truncate hover:underline">{c.customer}<span className="text-muted hidden sm:inline">　{c.subject}</span></Link>
              {c.urgency === "overdue" && <span className="text-[11px] rounded bg-red-50 text-red-700 px-1 shrink-0">要</span>}
              <span className="num shrink-0 text-right">{yen(c.total)}</span>
              <span className="num shrink-0 text-right text-xs text-muted hidden sm:inline">累計 {yen(c.cumulative_sales)}</span>
              {c.reaches_sales && i === firstReach && <span className="text-[11px] font-semibold text-ok shrink-0">達成</span>}
            </li>
          ))}
        </ul>
      )}
      
    </Card>
  );
}
