"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Contact, DealWithRefs, EndCustomer, TimelineItem } from "@eigyo/core/shared";
import { Button, Card, inputCls, labelCls } from "./ui";
import { DealStatusBadge } from "./deal-badge";
import { dateJp, yen } from "@/lib/format";

/** 要約の中の見積番号（Q202611-003）を、その見積りへのリンクにする。 */
function Linkify({ text, quoteIds }: { text: string; quoteIds: Record<string, number> }) {
  return <>{text.split(/(Q\d{6}-\d{3})/g).map((p, i) => quoteIds[p] ? <Link key={i} href={`/quotes/${quoteIds[p]}`} className="text-brand underline underline-offset-2">{p}</Link> : p)}</>;
}

const KIND_STYLE: Record<string, string> = { call: "bg-brand/10 text-brand", quote: "bg-blue-50 text-blue-700", followup: "bg-amber-50 text-amber-800", mail: "bg-green-50 text-green-700", handover: "bg-purple-50 text-purple-700", ai: "bg-gray-100 text-gray-600", status: "bg-gray-100 text-gray-700", note: "bg-gray-100 text-gray-700", created: "bg-gray-100 text-gray-500", link: "bg-gray-100 text-gray-500" };

export function DealDetail({ deal, timeline, contacts, endCustomers, siblings, quoteIds = {} }: { deal: DealWithRefs; timeline: TimelineItem[]; contacts: Contact[]; endCustomers: EndCustomer[]; siblings: { id: number; title: string }[]; aiEnabled?: boolean; quoteIds?: Record<string, number> }) {
  const router = useRouter();
  const [detail, setDetail] = useState(false);
  const [edit, setEdit] = useState(false);
  const [title, setTitle] = useState(deal.title);
  const [contactId, setContactId] = useState<number | "">(deal.contact_id ?? "");
  const [endId, setEndId] = useState<number | "">(deal.end_customer_id ?? "");
  const [nextAction, setNextAction] = useState(deal.next_action);
  const [due, setDue] = useState(deal.next_action_due ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [fix, setFix] = useState(false);
  const t = new Date().toISOString().slice(0, 10);
  const overdue = deal.next_action_due && deal.next_action_due < t;

  const call = async (label: string, url: string, body: unknown) => {
    setBusy(label); setErr(null);
    try { const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const j = await r.json(); if (!r.ok) throw new Error(j.error); router.refresh(); return j; } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };
  const patch = async (body: unknown) => {
    setBusy("patch"); setErr(null);
    try { const r = await fetch(`/api/deals/${deal.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const j = await r.json(); if (!r.ok) throw new Error(j.error); setEdit(false); setNote(""); router.refresh(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };
  const move = async (item: TimelineItem, to: string) => {
    if (!to) return;
    await call("move", `/api/deals/${deal.id}/move`, { [item.ref_type === "quote" ? "quote_id" : "call_id"]: item.ref_id, to: to === "new" ? "new" : Number(to), title: to === "new" ? item.body.slice(0, 30) : undefined });
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs text-muted"><Link href={`/customers/${deal.customer.id}`} className="hover:underline">{deal.customer.name}</Link>{deal.contact && <> ・ <Link href={`/contacts/${deal.contact.id}`} className="hover:underline">{deal.contact.name}（{deal.contact.department} {deal.contact.title}）</Link></>}{deal.end_customer && <> ・ 納入先 {deal.end_customer.name}</>}</div>
        <div className="flex flex-wrap items-center gap-2 mt-1"><h1 className="text-xl lg:text-2xl font-bold">{deal.title}</h1><DealStatusBadge status={deal.status} /></div>
        <div className="text-sm text-muted mt-1 num">金額 {yen(deal.amount)}・見積り {deal.quote_count} 件・電話 {deal.call_count} 件・開始 {dateJp(deal.opened_at)}・最終 {dateJp(deal.last_activity_at)}</div>
      </div>

      <Card title="経緯と状況" action={<div className="flex gap-2"><Button size="sm" onClick={() => setEdit(!edit)}>{edit ? "閉じる" : "編集"}</Button><Button size="sm" variant="primary" busy={busy === "refresh"} onClick={() => call("refresh", `/api/deals/${deal.id}/refresh`, {})}>要約を更新</Button></div>}>
        <pre className="whitespace-pre-wrap text-sm font-sans leading-relaxed">{deal.summary ? <Linkify text={deal.summary} quoteIds={quoteIds} /> : "まだ要約がありません。「要約を更新」を押してください"}</pre>
        <div className={`mt-3 rounded-md px-3 py-2 text-sm ${overdue ? "bg-red-50 border border-red-200 text-red-900" : "bg-blue-50 border border-blue-200 text-blue-900"}`}>
          <b>次の一手:</b> {deal.next_action || "未設定"}{deal.next_action_due && <span className="ml-2 text-xs">期限 {dateJp(deal.next_action_due)}{overdue ? "（期限切れ）" : ""}</span>}
        </div>
        {deal.summary_detail && (
          <div className="mt-2">
            <button type="button" className="text-xs text-brand hover:underline" onClick={() => setDetail(!detail)}>{detail ? "詳細を閉じる" : "詳細を見る"}</button>
            {detail && <pre className="whitespace-pre-wrap text-xs text-muted font-sans leading-relaxed mt-2 bg-bg rounded-md p-3"><Linkify text={deal.summary_detail} quoteIds={quoteIds} /></pre>}
          </div>
        )}
        {edit && (
          <div className="mt-4 grid gap-3 lg:grid-cols-2 border-t border-line pt-4">
            <div className="lg:col-span-2"><label className={labelCls}>件名</label><input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
            <div><label className={labelCls}>得意先の担当者</label><select className={inputCls} value={contactId} onChange={(e) => setContactId(e.target.value ? Number(e.target.value) : "")}><option value="">—</option>{contacts.map((c) => <option key={c.id} value={c.id}>{c.name}{c.status !== "active" ? `（${c.status === "retired" ? "退職" : "異動"}）` : ""}</option>)}</select></div>
            <div><label className={labelCls}>納入先</label><select className={inputCls} value={endId} onChange={(e) => setEndId(e.target.value ? Number(e.target.value) : "")}><option value="">—</option>{endCustomers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div><label className={labelCls}>次の一手</label><input className={inputCls} value={nextAction} onChange={(e) => setNextAction(e.target.value)} /></div>
            <div><label className={labelCls}>期限</label><input type="date" className={inputCls} value={due} onChange={(e) => setDue(e.target.value)} /></div>
            <div className="lg:col-span-2"><label className={labelCls}>メモ</label><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="経緯に残すメモ" /></div>
            <div className="lg:col-span-2 flex flex-wrap gap-2 justify-end">
              {deal.status !== "won" && deal.status !== "lost" && <><Button variant="danger" size="sm" busy={busy === "patch"} onClick={() => patch({ status: "lost" })}>失注で閉じる</Button><Button size="sm" busy={busy === "patch"} onClick={() => patch({ status: "won" })}>受注で閉じる</Button></>}
              <Button variant="primary" busy={busy === "patch"} onClick={() => patch({ title, contact_id: contactId || null, end_customer_id: endId || null, next_action: nextAction, next_action_due: due || null, note: note || undefined })}>保存</Button>
            </div>
          </div>
        )}
        {err && <p className="text-sm text-danger mt-2">{err}</p>}
      </Card>

      <Card title="時系列" action={<button type="button" className="text-xs text-brand hover:underline" onClick={() => setFix(!fix)}>{fix ? "修正を閉じる" : "紐づけを直す"}</button>}>
        <ul className="space-y-2">
          {timeline.map((it, i) => {
            const href = it.ref_type === "quote" && it.ref_id ? `/quotes/${it.ref_id}` : it.ref_type === "call" && it.ref_id ? `/calls/${it.ref_id}` : null;
            const badge = `inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold ${KIND_STYLE[it.kind] ?? "bg-gray-100"}`;
            return (
            <li key={i} className="flex gap-2 text-sm">
              <span className="text-xs text-muted num shrink-0 w-24 pt-0.5">{dateJp(it.at)} {it.at.slice(11, 16)}</span>
              <div className="min-w-0 flex-1">
                <div>{href ? <Link href={href} className={`${badge} underline underline-offset-2`}>{it.title} →</Link> : <span className={badge}>{it.title}</span>}</div>
                <div className={`text-xs mt-0.5 ${it.kind === "handover" ? "text-purple-700 font-semibold" : "text-muted"}`}>{it.body}</div>
                {fix && (it.kind === "quote" || it.kind === "call") && it.ref_id && (
                  <select className="mt-1 text-xs rounded border border-line px-2 py-1" defaultValue="" onChange={(e) => move(it, e.target.value)}>
                    <option value="">別の案件へ移す…</option>
                    {siblings.filter((s) => s.id !== deal.id).map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                    <option value="new">新しい案件として分離</option>
                  </select>
                )}
              </div>
            </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
