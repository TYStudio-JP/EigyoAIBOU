"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { InquiryAnswerDraft, InquiryChannel, InquiryFacts, InquiryKind, ResearchResult } from "@eigyo/core/shared";
import { INQUIRY_CHANNEL_LABEL, INQUIRY_KIND_LABEL } from "@eigyo/core/shared";
import { Button, Card, LevelBadge, inputCls, labelCls } from "./ui";
import { CopyButton } from "./modal";
import { dateJp, yen } from "@/lib/format";

/** 問い合わせ 1 件：質問 → 社内記録 → 回答文（短文／メール）→ コピー・共有 → 回答したと記録。送るのは人。 */
export function InquiryAnswer({ facts, aiEnabled, customers }: { facts: InquiryFacts; aiEnabled: boolean; customers: { id: number; short_name: string }[] }) {
  const router = useRouter();
  const i = facts.inquiry;
  const [draft, setDraft] = useState<InquiryAnswerDraft | null>(null);
  const [web, setWeb] = useState<ResearchResult | null>(null);
  const [aiUsed, setAiUsed] = useState<boolean | null>(null);
  const [text, setText] = useState(facts.deterministic_answer);
  const [mode, setMode] = useState<"short" | "mail">("short");
  const [channel, setChannel] = useState<InquiryChannel>(i.channel);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const run = async (useWeb: boolean) => {
    setBusy(useWeb ? "web" : "draft"); setErr(null);
    try {
      const r = await fetch(`/api/inquiries/${i.id}/draft`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ use_web: useWeb }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error ?? "失敗しました");
      setDraft(j.draft); setWeb(j.web); setAiUsed(j.ai_used); setText(mode === "short" ? j.draft.short_reply : j.draft.mail_body);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };
  const switchMode = (m: "short" | "mail") => { setMode(m); if (draft) setText(m === "short" ? draft.short_reply : draft.mail_body); };
  const share = async () => { try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(text); setMsg("コピーしました"); } } catch { /* cancelled */ } };
  const patch = async (body: Record<string, unknown>) => { const r = await fetch(`/api/inquiries/${i.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); if (r.ok) router.refresh(); };
  const answered = async () => {
    setBusy("answer"); setErr(null);
    try {
      const r = await fetch(`/api/inquiries/${i.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answer: text, answer_channel: channel }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error ?? "失敗しました");
      setMsg("回答済みにしました"); router.refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };
  const mailto = `mailto:${encodeURIComponent(facts.customer?.contact_email ?? "")}?subject=${encodeURIComponent(draft?.mail_subject ?? "お問い合わせの件")}&body=${encodeURIComponent(text.slice(0, 1800))}`;

  return (
    <div className="space-y-3 pb-6">
      <Card title="質問" action={<span className={`text-[11px] rounded px-2 py-0.5 ${i.status === "open" ? "bg-amber-50 text-amber-800" : "bg-green-50 text-green-700"}`}>{i.status === "open" ? "未回答" : `回答済み ${dateJp(i.answered_at)}`}</span>}>
        <pre className="whitespace-pre-wrap text-sm font-sans">{i.question}</pre>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <div><label className={labelCls}>得意先</label><select className={inputCls} value={i.customer_id ?? ""} onChange={(e) => patch({ customer_id: e.target.value ? Number(e.target.value) : null })}><option value="">未設定</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.short_name}</option>)}</select></div>
          <div><label className={labelCls}>種類</label><select className={inputCls} value={i.kind} onChange={(e) => patch({ kind: e.target.value as InquiryKind })}>{(Object.keys(INQUIRY_KIND_LABEL) as InquiryKind[]).map((k) => <option key={k} value={k}>{INQUIRY_KIND_LABEL[k]}</option>)}</select></div>
        </div>
        {facts.customer?.contact_name && <div className="mt-1 text-xs text-muted">{facts.customer.contact_name} 様{facts.customer.tel && <a href={`tel:${facts.customer.tel}`} className="ml-2 text-brand">☎ {facts.customer.tel}</a>}</div>}
      </Card>

      <Card title="社内記録（数字はここからだけ）">
        {facts.products.length === 0 ? <p className="text-sm text-muted">商品を特定できませんでした。品番か商品名を質問文に足すか、種類を直してください。</p> : (
          <ul className="space-y-2 text-sm">
            {facts.products.map((f) => (
              <li key={f.product.id} className="rounded-md border border-line p-2">
                <div className="font-medium">{f.product.name} <span className="text-xs text-muted">{f.product.maker} {f.product.part_number}{f.product.spec ? `・${f.product.spec}` : ""}</span></div>
                <div className="text-xs mt-1 flex flex-wrap gap-x-3 gap-y-0.5 num">
                  {f.earliest_delivery && <span>最短納品 <b>{dateJp(f.earliest_delivery)}</b>（{f.shortest_lead_days} 日）</span>}
                  {f.last_price_to_customer && <span>前回 <b>{yen(f.last_price_to_customer.unit_price)}</b>（{dateJp(f.last_price_to_customer.date)}）</span>}
                  {f.other_customers && <span className="text-muted">他社向け {yen(f.other_customers.min)}〜{yen(f.other_customers.max)}</span>}
                  {f.best_cost != null && <span className="text-muted">最安仕入 {yen(f.best_cost)}（社外秘）</span>}
                </div>
                {f.routes.length > 0 && <div className="text-[11px] text-muted mt-0.5">仕入れ: {f.routes.map((r) => `${r.supplier_name.replace(/株式会社/g, "")}（${r.route_label}・${r.lead_time_days ?? "-"}日）`).join(" / ")}</div>}
                {f.same_category.length > 0 && <div className="text-[11px] text-muted mt-0.5">同区分の取扱品: {f.same_category.map((x) => `${x.name}（${x.part_number}）`).join("、")}</div>}
              </li>
            ))}
          </ul>
        )}
        {facts.open_points.length > 0 && <ul className="mt-2 text-xs text-warn list-disc pl-4">{facts.open_points.map((p, k) => <li key={k}>{p}</li>)}</ul>}
      </Card>

      <Card title="回答文" action={<div className="flex gap-1">
        <Button size="sm" variant="primary" busy={busy === "draft"} onClick={() => run(false)} disabled={!aiEnabled} title={aiEnabled ? "" : "AI 未接続：社内記録の文面を使います"}>社内記録で作る</Button>
        <Button size="sm" busy={busy === "web"} onClick={() => run(true)} disabled={!aiEnabled} title={aiEnabled ? "" : "AI 未接続"}>ウェブも調べて作る</Button>
      </div>}>
        {draft && (
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
            <LevelBadge level={draft.confidence === "high" ? "ok" : draft.confidence === "medium" ? "info" : "warn"}>{{ high: "社内記録で裏付けあり", medium: "ウェブ情報で補足", low: "要確認" }[draft.confidence]}</LevelBadge>
            {aiUsed === false && <span className="text-muted">AI 未接続のため社内記録の文面</span>}
            <span className="text-muted">次の一手: {draft.next_action}</span>
          </div>
        )}
        <div className="grid grid-cols-2 rounded-lg border border-line bg-bg p-0.5 text-sm mb-2">
          <button type="button" onClick={() => switchMode("short")} className={`rounded-md py-1 ${mode === "short" ? "bg-surface font-semibold shadow-sm" : "text-muted"}`}>短文（SMS・LINE・電話）</button>
          <button type="button" onClick={() => switchMode("mail")} className={`rounded-md py-1 ${mode === "mail" ? "bg-surface font-semibold shadow-sm" : "text-muted"}`}>メール</button>
        </div>
        <textarea className={`${inputCls} h-52 font-sans`} value={text} onChange={(e) => setText(e.target.value)} />
        {draft && draft.open_points.length > 0 && <ul className="mt-2 text-xs text-warn list-disc pl-4">{draft.open_points.map((p, k) => <li key={k}>送る前に: {p}</li>)}</ul>}
        {web && <details className="mt-2 text-xs"><summary className="cursor-pointer text-brand">ウェブで調べた内容（出典 {web.sources.length} 件）</summary><pre className="whitespace-pre-wrap font-sans mt-1 bg-bg rounded p-2">{web.summary}</pre><ul className="mt-1">{web.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer" className="text-brand hover:underline">{s.title || s.url}</a></li>)}</ul></details>}
        <div className="mt-3 flex flex-wrap gap-2">
          <CopyButton text={text} label="コピー" />
          <Button size="sm" onClick={share}>共有（SMS・LINE へ）</Button>
          {mode === "mail" && <a href={mailto} className="text-xs rounded border border-line px-2 py-1 hover:bg-bg">メールアプリで開く</a>}
          <Link href={facts.customer ? `/quotes/new?customer=${facts.customer.id}` : "/quotes/new"} className="text-xs rounded border border-line px-2 py-1 hover:bg-bg">見積りにする</Link>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-line pt-3">
          <div><label className={labelCls}>回答した手段</label><select className={inputCls} value={channel} onChange={(e) => setChannel(e.target.value as InquiryChannel)}>{(Object.keys(INQUIRY_CHANNEL_LABEL) as InquiryChannel[]).map((k) => <option key={k} value={k}>{INQUIRY_CHANNEL_LABEL[k]}</option>)}</select></div>
          <Button variant="primary" busy={busy === "answer"} onClick={answered} disabled={!text.trim()}>この内容で回答したと記録</Button>
          {i.status !== "open" && <Button size="sm" variant="ghost" onClick={() => patch({ status: "open" })}>未回答に戻す</Button>}
        </div>
        {msg && <p className="text-sm text-ok mt-2">{msg}</p>}
        {err && <p className="text-sm text-danger mt-2">{err}</p>}
      </Card>
      {i.answer && <Card title={`送った回答（${INQUIRY_CHANNEL_LABEL[i.answer_channel ?? "mail"]}・${dateJp(i.answered_at)}）`}><pre className="whitespace-pre-wrap text-sm font-sans">{i.answer}</pre></Card>}
    </div>
  );
}
