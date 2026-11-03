"use client";
import { useState } from "react";
import Link from "next/link";
import type { VisitBrief, VisitBriefAi } from "@eigyo/core/shared";
import { Button, Card } from "./ui";
import { yen } from "@/lib/format";

export function BriefView({ brief, aiEnabled }: { brief: VisitBrief; aiEnabled: boolean }) {
  const [ai, setAi] = useState<VisitBriefAi | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const c = brief.customer!;
  const run = async () => {
    setBusy(true); setErr(null);
    try { const r = await fetch(`/api/customers/${c.id}/brief`, { method: "POST" }); const j = await r.json(); if (!r.ok) throw new Error(j.error); setAi(j); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-3">
      <Card title="今日話すこと" action={<Button size="sm" variant="primary" busy={busy} onClick={run} disabled={!aiEnabled} title={aiEnabled ? "" : "設定で AI を接続すると使えます"}>要点にまとめる</Button>}>
        {ai ? (
          <div className="text-sm space-y-2">
            <div className="font-semibold">{ai.headline}</div>
            <ol className="list-decimal pl-5 space-y-1">{ai.talking_points.map((p, i) => <li key={i}>{p}</li>)}</ol>
            {ai.cautions.length > 0 && <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-amber-900"><b>注意:</b><ul className="list-disc pl-5">{ai.cautions.map((p, i) => <li key={i}>{p}</li>)}</ul></div>}
            <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-blue-900"><b>持ち帰る情報:</b> {ai.ask}</div>
          </div>
        ) : (
          <ol className="list-decimal pl-5 text-sm space-y-1">{brief.talking_points.map((p, i) => <li key={i}>{p}</li>)}{brief.talking_points.length === 0 && <li className="list-none text-muted">話題の材料がまだありません</li>}</ol>
        )}
        {err && <p className="text-sm text-danger mt-2">{err}</p>}
        {brief.handover_notes.length > 0 && <div className="mt-2 text-xs text-purple-700">前任者からの申し送り: {brief.handover_notes.join(" / ")}</div>}
      </Card>
      <Card title={`進行中の案件（${brief.open_deals.length}）`}>
        {brief.open_deals.length === 0 ? <p className="text-sm text-muted">なし</p> : <ul className="divide-y divide-line">{brief.open_deals.map((d) => <li key={d.id} className="py-2 text-sm"><Link href={`/deals/${d.id}`} className="font-semibold hover:underline">{d.title}</Link> <span className="text-xs text-muted">[{d.status}] {yen(d.amount)}{d.contact ? `・${d.contact}` : ""}</span><div className={`text-xs ${d.overdue ? "text-danger" : "text-muted"}`}>→ {d.next_action || "次の一手未設定"}{d.due ? `（${d.due}）` : ""}</div></li>)}</ul>}
      </Card>
      <div className="grid sm:grid-cols-2 gap-3">
        <Card title="担当者">
          <ul className="text-sm space-y-1">{brief.contacts.map((k) => <li key={k.id}><Link href={`/contacts/${k.id}`} className={`font-medium hover:underline ${k.status !== "在籍" ? "text-muted line-through" : ""}`}>{k.name}</Link> <span className="text-xs text-muted">{k.department} {k.title}{k.status !== "在籍" ? `（${k.status}）` : ""}</span>{k.mobile && <a href={`tel:${k.mobile}`} className="ml-2 text-xs text-brand">☎ {k.mobile}</a>}{k.notes && <div className="text-xs text-muted">{k.notes}</div>}</li>)}</ul>
        </Card>
        <Card title="直近の電話・返事待ちの見積り">
          <ul className="text-sm space-y-1">
            {brief.recent_calls.map((x) => <li key={x.id}><Link href={`/calls/${x.id}`} className="hover:underline"><span className="text-xs text-muted num">{x.at}</span> {x.contact ?? ""} {x.headline}</Link>{x.needs.map((n, i) => <div key={i} className="text-xs text-warn">要対応: {n}</div>)}</li>)}
            {brief.waiting_quotes.map((q) => <li key={q.id}><Link href={`/quotes/${q.id}`} className="hover:underline">{q.quote_no} {q.subject} {yen(q.total)}</Link><div className="text-xs text-muted">提出から {q.days} 日。{q.suggestion}</div></li>)}
            {brief.recent_calls.length === 0 && brief.waiting_quotes.length === 0 && <li className="text-muted">なし</li>}
          </ul>
        </Card>
        <Card title="定番の購入品（直近単価）"><ul className="text-sm space-y-0.5">{brief.staples.map((s, i) => <li key={i} className="flex justify-between"><span>{s.name}</span><span className="num text-muted">{yen(s.last_price)}・{s.last_date}</span></li>)}</ul></Card>
        <Card title="横展開の候補・直近の失注">
          <ul className="text-sm space-y-1">{brief.cross_sell.map((x) => <li key={x.code}><b>{x.name}</b> <span className="text-xs text-muted">参考 {yen(x.reference_price)}・{x.reason}</span></li>)}{brief.recent_lost.map((l) => <li key={l.quote_no} className="text-xs text-danger">失注 {l.at} {l.subject}：{l.reason}</li>)}</ul>
        </Card>
      </div>
    </div>
  );
}
