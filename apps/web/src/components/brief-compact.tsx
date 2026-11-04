"use client";
import { useState } from "react";
import Link from "next/link";
import type { VisitBrief, VisitBriefAi } from "@eigyo/core/shared";
import { Button } from "./ui";
import { yen } from "@/lib/format";

/** 訪問前ブリーフの短縮版：スマホ 1 スクロールで、話すこと→案件→返事待ち→担当者→前回の約束→定番品。 */
export function BriefCompact({ brief, aiEnabled, headline }: { brief: VisitBrief; aiEnabled: boolean; headline?: React.ReactNode }) {
  const [ai, setAi] = useState<VisitBriefAi | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const c = brief.customer!;
  const run = async () => {
    setBusy(true); setErr(null);
    try { const r = await fetch(`/api/customers/${c.id}/brief`, { method: "POST" }); const j = await r.json(); if (!r.ok) throw new Error(j.error); setAi(j); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const promises = brief.recent_calls.flatMap((x) => x.needs.map((n) => ({ at: x.at, text: n })));
  return (
    <div className="space-y-3 text-sm">
      {headline}
      <section className="rounded-lg border border-line bg-surface p-3">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="font-semibold">話すこと</div>
          <Button size="sm" variant="primary" busy={busy} onClick={run} disabled={!aiEnabled}>要約</Button>
        </div>
        {ai ? (
          <div className="space-y-1.5">
            <div className="font-semibold">{ai.headline}</div>
            <ol className="list-decimal pl-5 space-y-0.5">{ai.talking_points.map((p, i) => <li key={i}>{p}</li>)}</ol>
            {ai.cautions.length > 0 && <div className="rounded bg-amber-50 border border-amber-200 px-2 py-1.5 text-xs text-amber-900">注意: {ai.cautions.join(" / ")}</div>}
            <div className="rounded bg-blue-50 border border-blue-200 px-2 py-1.5 text-xs text-blue-900">持ち帰る: {ai.ask}</div>
          </div>
        ) : (
          <ol className="list-decimal pl-5 space-y-0.5">{brief.talking_points.slice(0, 5).map((p, i) => <li key={i}>{p}</li>)}{brief.talking_points.length === 0 && <li className="list-none text-muted">なし</li>}</ol>
        )}
        {err && <p className="text-xs text-danger mt-1">{err}</p>}
        {brief.handover_notes.length > 0 && <div className="mt-1.5 text-xs text-purple-700">前任者の申し送り: {brief.handover_notes.join(" / ")}</div>}
      </section>

      {brief.open_deals.length > 0 && (
        <section className="rounded-lg border border-line bg-surface p-3">
          <div className="font-semibold mb-1">進行中の案件（{brief.open_deals.length}）</div>
          <ul className="divide-y divide-line">{brief.open_deals.slice(0, 4).map((d) => <li key={d.id} className="py-1.5"><Link href={`/deals/${d.id}`} className="font-medium">{d.title}</Link> <span className="text-xs text-muted num">{d.status}・{yen(d.amount)}</span><div className={`text-xs ${d.overdue ? "text-danger" : "text-muted"}`}>→ {d.next_action || "次の一手未設定"}{d.due ? `（${d.due}）` : ""}</div></li>)}</ul>
        </section>
      )}

      {(brief.waiting_quotes.length > 0 || promises.length > 0) && (
        <section className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
          <div className="font-semibold mb-1">返事待ち・前回の約束</div>
          <ul className="space-y-1 text-xs">
            {brief.waiting_quotes.map((q) => <li key={q.id}><Link href={`/quotes/${q.id}`} className="font-medium">{q.quote_no} {q.subject}</Link> <span className="num">{yen(q.total)}</span>・提出から {q.days} 日</li>)}
            {promises.map((p, i) => <li key={i} className="text-warn">要対応: {p.text} <span className="text-muted num">（{p.at}）</span></li>)}
          </ul>
        </section>
      )}

      <section className="rounded-lg border border-line bg-surface p-3">
        <div className="font-semibold mb-1">担当者</div>
        <ul className="space-y-0.5">{brief.contacts.filter((k) => k.status === "在籍").slice(0, 4).map((k) => <li key={k.id} className="flex items-center gap-2"><span className="font-medium">{k.name}</span><span className="text-xs text-muted">{k.department} {k.title}</span>{k.mobile && <a href={`tel:${k.mobile}`} className="ml-auto text-xs text-brand">☎ {k.mobile}</a>}</li>)}{brief.contacts.length === 0 && <li className="text-muted text-xs">未登録</li>}</ul>
      </section>

      <section className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg border border-line bg-surface p-3"><div className="font-semibold mb-1">定番の購入品</div><ul className="space-y-0.5">{brief.staples.slice(0, 4).map((s, i) => <li key={i} className="flex justify-between gap-1"><span className="truncate">{s.name}</span><span className="num text-muted shrink-0">{yen(s.last_price)}</span></li>)}{brief.staples.length === 0 && <li className="text-muted">なし</li>}</ul></div>
        <div className="rounded-lg border border-line bg-surface p-3"><div className="font-semibold mb-1">横展開のネタ</div><ul className="space-y-0.5">{brief.cross_sell.slice(0, 3).map((x) => <li key={x.code} className="truncate">{x.name}</li>)}{brief.cross_sell.length === 0 && <li className="text-muted">なし</li>}</ul>{brief.recent_lost[0] && <div className="mt-1 text-danger">失注 {brief.recent_lost[0].at}：{brief.recent_lost[0].reason}</div>}</div>
      </section>
      <div className="text-right"><Link href={`/customers/${c.id}/brief`} className="text-xs text-brand">詳細 →</Link></div>
    </div>
  );
}
