"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CallWithCustomer, Contact, Customer } from "@eigyo/core/shared";
import { CALL_REQUEST_LABEL, CALL_STATUS_LABEL } from "@eigyo/core/shared";
import { Button, Card, LevelBadge, inputCls } from "./ui";
import { CopyButton } from "./modal";
import { CallMemo } from "./call-memo";
import { CallProcessing } from "./call-processing";

export function CallDetail({ call, customers, contacts, aiEnabled, fresh, deal, dealOptions }: { call: CallWithCustomer; customers: Customer[]; contacts: Contact[]; aiEnabled: boolean; fresh?: boolean; deal?: { id: number; title: string } | null; dealOptions?: { id: number; title: string }[] }) {
  const router = useRouter();
  const m = call.minutes;
  const [subject, setSubject] = useState(call.mail_subject ?? "");
  const [body, setBody] = useState(call.mail_body ?? "");
  const [editMemo, setEditMemo] = useState(!m);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const c = call.customer;
  const to = c?.contact_email ?? "";
  const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  const post = async (label: string, url: string, payload: unknown) => {
    setBusy(label); setErr(null);
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      router.refresh();
      return j;
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };
  const dur = call.duration_sec ? `${Math.floor(call.duration_sec / 60)}分${call.duration_sec % 60}秒` : "";
  const needs = m?.requests.filter((r) => r.result?.status === "needs_human").length ?? 0;
  const processing = call.process_state === "running" || call.process_state === "cancel";

  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl lg:text-2xl font-bold">{c ? c.short_name : call.tel ? `未登録の番号 ${call.tel}` : "得意先未設定"}</h1>
          <span className="rounded px-2 py-0.5 text-xs font-semibold bg-gray-100 text-gray-700">{CALL_STATUS_LABEL[call.status]}</span>
          {needs > 0 && <LevelBadge level="warn">担当確認 {needs} 件</LevelBadge>}
        </div>
        <div className="text-sm text-muted mt-1">{{ in: "着信", out: "発信", unknown: "通話" }[call.direction]} {call.started_at.slice(0, 16)}{dur ? `（${dur}）` : ""}{c?.contact_name ? `・${c.contact_name}` : ""}{call.source === "android" ? "・Android で自動検知" : ""}</div>
        {m && (
          <div className="text-xs mt-1 flex flex-wrap items-center gap-2">
            <span className="text-muted">案件:</span>
            {deal ? <Link href={`/deals/${deal.id}`} className="rounded bg-brand/10 text-brand px-2 py-0.5 font-semibold hover:underline">◆ {deal.title}</Link> : <span className="text-muted">未紐づけ</span>}
            {dealOptions && dealOptions.length > 0 && (
              <select className="text-xs rounded border border-line px-1.5 py-0.5" defaultValue="" onChange={async (e) => { if (!e.target.value) return; await fetch(`/api/calls/${call.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deal_id: Number(e.target.value) }) }); router.refresh(); }}>
                <option value="">別の案件へ…</option>{dealOptions.filter((o) => o.id !== deal?.id).map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
              </select>
            )}
          </div>
        )}
        {fresh && !m && <div className="mt-2 rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-900">通話が終わりました。要点を記録してください。</div>}
      </div>

      {processing && <CallProcessing callId={call.id} state={call.process_state!} />}
      {!processing && call.process_error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">作成できませんでした：{call.process_error}</div>}

      {!processing && (editMemo || !m) && (
        <Card title={m ? "メモを修正して再処理" : "電話メモ"} action={m ? <Button size="sm" onClick={() => setEditMemo(false)}>閉じる</Button> : undefined}>
          <CallMemo call={call} customers={customers} contacts={contacts} aiEnabled={aiEnabled} autostart={fresh} />
        </Card>
      )}

      {m && !processing && (
        <>
          <Card title="議事録" action={<div className="flex gap-2">{!editMemo && <Button size="sm" onClick={() => setEditMemo(true)}>メモを修正</Button>}<Button size="sm" busy={busy === "re"} onClick={() => post("re", `/api/calls/${call.id}/process`, {})} disabled={!aiEnabled}>再処理</Button></div>}>
            <pre className="whitespace-pre-wrap text-sm font-sans leading-relaxed">{m.summary}</pre>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              {m.counterpart && <span>相手: {m.counterpart}</span>}
              {m.next_contact && <span>次回: {m.next_contact}</span>}
              {m.mood && <span>温度感: {{ good: "良好", neutral: "普通", concerned: "注意" }[m.mood]}</span>}
            </div>
          </Card>

          <Card title={`依頼事項（${m.requests.length}）`}>
            {m.requests.length === 0 ? <p className="text-sm text-muted">依頼事項はありませんでした。</p> : (
              <ul className="space-y-3">
                {m.requests.map((r, i) => (
                  <li key={i} className={`rounded-lg border p-3 ${r.result?.status === "needs_human" ? "border-amber-200 bg-amber-50/50" : "border-line"}`}>
                    <div className="flex items-center gap-2 text-xs mb-1">
                      <span className="rounded bg-brand/10 text-brand px-1.5 py-0.5 font-semibold">{CALL_REQUEST_LABEL[r.kind]}</span>
                      {r.result && <LevelBadge level={r.result.status === "done" ? "ok" : r.result.status === "needs_human" ? "warn" : "info"}>{{ done: "回答できる", needs_human: "担当者の判断が必要", skipped: "対象外" }[r.result.status]}</LevelBadge>}
                    </div>
                    <div className="text-sm">{r.detail}</div>
                    {r.result && (
                      <div className="mt-2 text-sm">
                        <div className="font-semibold">→ {r.result.headline}</div>
                        <div className="text-xs text-muted mt-0.5">{r.result.detail}</div>
                        {r.result.quote_id && <Link href={`/quotes/${r.result.quote_id}`} className="inline-block mt-1 text-xs text-brand hover:underline">見積り {r.result.quote_no} を開く →</Link>}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {(m.promises.length > 0 || m.rep_todos.length > 0) && (
              <div className="grid sm:grid-cols-2 gap-3 mt-4 text-sm">
                {m.promises.length > 0 && <div className="rounded-md bg-bg p-3"><div className="text-xs text-muted mb-1">こちらが約束したこと</div><ul className="list-disc pl-5">{m.promises.map((p, i) => <li key={i}>{p}</li>)}</ul></div>}
                {m.rep_todos.length > 0 && <div className="rounded-md bg-bg p-3"><div className="text-xs text-muted mb-1">営業担当がやること</div><ul className="list-disc pl-5">{m.rep_todos.map((p, i) => <li key={i}>{p}</li>)}</ul></div>}
              </div>
            )}
          </Card>

          <Card title="確認メール" action={call.status === "sent" ? <span className="text-xs text-ok font-semibold">送付済</span> : undefined}>
            <div className="space-y-2">
              <div className="text-xs text-muted">宛先: {to || "未登録"}</div>
              <input className={`${inputCls} py-2.5 text-base`} value={subject} onChange={(e) => setSubject(e.target.value)} />
              <textarea className={`${inputCls} text-base leading-relaxed`} rows={12} value={body} onChange={(e) => setBody(e.target.value)} />
              <div className="flex flex-col sm:flex-row gap-2">
                <a href={mailto} className="inline-flex items-center justify-center rounded-md bg-brand text-brand-ink px-4 py-3 text-base font-semibold" onClick={() => post("mail", `/api/calls/${call.id}/mail`, { subject, body })}>メールアプリで開く</a>
                <CopyButton text={`件名: ${subject}\n\n${body}`} label="件名＋本文をコピー" />
                <Button busy={busy === "sent"} onClick={() => post("sent", `/api/calls/${call.id}/mail`, { subject, body, sent: true })} className="justify-center">送った → 記録</Button>
              </div>
            </div>
          </Card>
        </>
      )}
      {err && <p className="text-sm text-danger">{err}</p>}
      {call.memo && (processing || (m && !editMemo)) && <Card title="元のメモ"><pre className="whitespace-pre-wrap text-xs text-muted font-sans">{call.memo}</pre></Card>}
    </div>
  );
}
