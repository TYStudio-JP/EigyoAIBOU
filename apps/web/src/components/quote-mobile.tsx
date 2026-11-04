"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormalDiff, LostReason, ProvisionalChannel, QuoteStatus, QuoteWithItems, SelfMailPackage } from "@eigyo/core/shared";
import { DELIVERY_KIND_LABEL, LOST_REASON_LABEL, PROVISIONAL_CHANNEL_LABEL, rulePrice } from "@eigyo/core/shared";
import type { DraftItem } from "@/lib/draft";
import type { LineCheck } from "./quote-detail";
import { Button, LevelBadge, StatusBadge, inputCls, labelCls } from "./ui";
import { Modal, CopyButton } from "./modal";
import { FollowupModal } from "./followup-modal";
import { worst } from "./items-editor";
import { dateJp, pct, yen } from "@/lib/format";

/**
 * スマホ「ポイント確認」：外出先で 30 秒で判断するための見積り画面。
 * 明細は必ず見せる（コンパクトなカード）。「暫定で回答」「自分宛てに送る」は画面下に常時。
 * 得意先には直接送らない（自分宛てメール／共有のみ）。
 */
const FLOW: Record<QuoteStatus, { next: QuoteStatus; label: string }[]> = {
  draft: [{ next: "submitted", label: "提出済にする" }],
  submitted: [{ next: "tracking", label: "追跡中にする" }, { next: "won", label: "受注！" }, { next: "lost", label: "失注…" }],
  tracking: [{ next: "won", label: "受注！" }, { next: "lost", label: "失注…" }],
  won: [{ next: "tracking", label: "追跡中に戻す" }],
  lost: [{ next: "tracking", label: "追跡中に戻す" }],
};

type Sheet = null | "provisional" | "self" | "more" | "lost";

export function QuoteMobile({ quote, lines, aiEnabled, deal, diff }: { quote: QuoteWithItems; lines: LineCheck[]; aiEnabled: boolean; deal?: { id: number; title: string } | null; diff: FormalDiff }) {
  const router = useRouter();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [edit, setEdit] = useState<Record<number, { unit_price: number; cost: number }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [followup, setFollowup] = useState(false);
  const pending = Boolean(quote.provisional_at && !quote.formal_sent_at);
  const overall = worst(lines.flatMap((l) => l.checks));
  const warnCount = lines.flatMap((l) => l.checks).filter((c) => c.level === "warn" || c.level === "danger").length;
  const tax = Math.round(quote.total * 0.1);
  const dirty = Object.keys(edit).length > 0;

  const api = async (label: string, fn: () => Promise<Response>) => {
    setBusy(label); setErr(null);
    try {
      const r = await fn();
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { const e = new Error(j.error ?? "失敗しました") as Error & { payload?: unknown; status?: number }; e.payload = j; e.status = r.status; throw e; }
      return j;
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); throw e; } finally { setBusy(null); }
  };
  const safe = async <T,>(p: Promise<T>): Promise<T | null> => { try { return await p; } catch { return null; } };

  /** 明細の単価・仕入れ値をまとめて保存（ポイント確認からの素早い修正）。 */
  const saveEdits = async () => {
    const items = quote.items.map((it, i) => ({ product_id: it.product_id, description: it.description, qty: it.qty, unit: it.unit, unit_price: edit[i]?.unit_price ?? it.unit_price, cost: edit[i]?.cost ?? it.cost, supplier_id: it.supplier_id, supplier_delivery: it.supplier_delivery, remarks: it.remarks }));
    const changed = quote.items.map((it, i) => (edit[i] ? `${it.description} 単価 ${yen(it.unit_price)}→${yen(edit[i].unit_price)}${edit[i].cost !== it.cost ? `／仕入 ${yen(it.cost)}→${yen(edit[i].cost)}` : ""}` : null)).filter(Boolean).join("、");
    const j = await safe(api("items", () => fetch(`/api/quotes/${quote.id}/items`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items, note: `スマホで明細を修正：${changed}` }) })));
    if (j) { setEdit({}); setOpen(null); router.refresh(); }
  };
  const setStatus = async (status: QuoteStatus, extra: Record<string, unknown> = {}) => {
    const j = await safe(api("status", () => fetch(`/api/quotes/${quote.id}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, ...extra }) })));
    if (j) { setSheet(null); router.refresh(); }
  };
  const markFormal = async () => {
    const j = await safe(api("formal", () => fetch(`/api/quotes/${quote.id}/formal-sent`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) })));
    if (j) { setSheet(null); router.refresh(); }
  };

  return (
    <div className="space-y-3 pb-28">
      {/* ヘッダー：誰の・何の・いくら */}
      <section className="bg-surface border border-line rounded-lg p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link href={`/customers/${quote.customer.id}`} className="font-bold text-base leading-tight block truncate">{quote.customer.name}</Link>
            <div className="text-xs text-muted mt-0.5 truncate">{quote.customer.contact_name ? `${quote.customer.contact_name} 様　` : ""}{quote.customer.tel && <a href={`tel:${quote.customer.tel}`} className="text-brand">☎ {quote.customer.tel}</a>}</div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <StatusBadge status={quote.status} />
            {pending && <span className="inline-block rounded px-2 py-0.5 text-[11px] font-semibold bg-amber-100 text-amber-900 border border-amber-300">正式未送付</span>}
          </div>
        </div>
        <div className="mt-2 text-sm font-medium">{quote.subject}</div>
        <div className="text-[11px] text-muted num">{quote.quote_no}{deal ? <>　◆ <Link href={`/deals/${deal.id}`} className="text-brand">{deal.title}</Link></> : null}</div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-md bg-bg py-2"><div className="text-[11px] text-muted">合計（税抜）</div><div className="num font-bold text-base">{yen(quote.total)}</div></div>
          <div className="rounded-md bg-bg py-2"><div className="text-[11px] text-muted">粗利率</div><div className={`num font-bold text-base ${quote.margin_pct < 15 ? "text-danger" : quote.margin_pct < 25 ? "text-warn" : "text-ok"}`}>{pct(quote.margin_pct, 1)}</div></div>
          <div className="rounded-md bg-bg py-2"><div className="text-[11px] text-muted">要確認</div><div className={`num font-bold text-base ${warnCount ? (overall === "danger" ? "text-danger" : "text-warn") : "text-ok"}`}>{warnCount ? `${warnCount} 件` : "なし"}</div></div>
        </div>
        <div className="mt-2 text-[11px] text-muted num flex flex-wrap gap-x-3">
          <span>希望納期 <b className="text-ink">{dateJp(quote.requested_delivery)}</b></span>
          <span>回答納期 <b className="text-ink">{dateJp(quote.promised_delivery)}</b>{quote.promised_delivery && <span className={`ml-1 rounded px-1 ${quote.delivery_kind === "confirmed" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-800"}`}>{quote.delivery_kind === "confirmed" ? "確定" : "概算"}</span>}</span>
          <span>有効期限 {dateJp(quote.valid_until)}</span>
        </div>
        {pending && (
          <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {dateJp(quote.provisional_at)} {PROVISIONAL_CHANNEL_LABEL[quote.provisional_channel ?? "phone"].replace(/（.*）/, "")}で暫定回答済み
            {diff.changed && <ul className="mt-1 text-danger font-semibold list-disc pl-4">{diff.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>}
          </div>
        )}
        {quote.status === "lost" && <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">失注理由: <b>{LOST_REASON_LABEL[quote.lost_reason ?? "other"]}</b>　{quote.lost_detail}</div>}
      </section>
      {err && <p className="text-sm text-danger px-1">{err}</p>}

      {/* 明細カード：必ず見せる。タップで根拠と修正 */}
      <section className="space-y-2">
        <div className="flex items-center justify-between px-1"><h2 className="text-sm font-semibold">明細 {quote.items.length}</h2>{dirty && <Button size="sm" variant="primary" busy={busy === "items"} onClick={saveEdits}>修正を保存</Button>}</div>
        {quote.items.map((it, i) => <ItemCard key={it.id} item={it} line={lines[i]} isOpen={open === i} onToggle={() => setOpen(open === i ? null : i)} edit={edit[i]} onEdit={(v) => setEdit({ ...edit, [i]: v })} onReset={() => { const n = { ...edit }; delete n[i]; setEdit(n); }} />)}
        <div className="text-right text-xs text-muted num px-1">小計 {yen(quote.total)}　消費税 {yen(tax)}　<b className="text-ink text-sm">合計 {yen(quote.total + tax)}</b></div>
        {quote.notes && <div className="text-xs text-muted px-1">備考: {quote.notes}</div>}
      </section>

      {/* 下固定バー：いつでも押せる */}
      <div className="fixed inset-x-0 z-20 bg-surface/95 backdrop-blur border-t border-line px-3 py-2 grid grid-cols-3 gap-2" style={{ bottom: "calc(52px + env(safe-area-inset-bottom))" }}>
        <Button className="justify-center" onClick={() => setSheet("provisional")} disabled={quote.status === "lost"}>暫定で回答</Button>
        <Button variant="primary" className="justify-center" onClick={() => setSheet("self")}>自分宛てに送る</Button>
        <Button className="justify-center" onClick={() => setSheet("more")}>{pending ? "正式送付…" : "状態・他"}</Button>
      </div>

      {sheet === "provisional" && <ProvisionalSheet quote={quote} onClose={() => setSheet(null)} onDone={() => { setSheet(null); router.refresh(); }} />}
      {sheet === "self" && <SelfMailSheet quote={quote} onClose={() => setSheet(null)} onDone={() => { setSheet(null); router.refresh(); }} />}
      {sheet === "more" && (
        <Modal title="状態・その他" onClose={() => setSheet(null)}>
          <div className="space-y-2">
            {pending && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs">
                <div className="font-semibold text-amber-900">正式見積書</div>
                {diff.changed && <ul className="mt-1 text-danger list-disc pl-4">{diff.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>}
                <Button variant="primary" className="w-full justify-center mt-2" busy={busy === "formal"} onClick={markFormal}>正式送付済みにする</Button>
              </div>
            )}
            {FLOW[quote.status].map((f) => (
              <Button key={f.next} className="w-full justify-center" variant={f.next === "won" ? "primary" : f.next === "lost" ? "danger" : "secondary"} busy={busy === "status"} onClick={() => (f.next === "lost" ? setSheet("lost") : setStatus(f.next))}>{f.label}</Button>
            ))}
            {(quote.status === "submitted" || quote.status === "tracking") && <Button className="w-full justify-center" disabled={!aiEnabled} onClick={() => { setSheet(null); setFollowup(true); }}>フォロー文面を作る（AI）</Button>}
            <Button className="w-full justify-center" onClick={async () => { await fetch(`/api/quotes/${quote.id}/delivery-kind`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: quote.delivery_kind === "confirmed" ? "estimate" : "confirmed" }) }); setSheet(null); router.refresh(); }}>回答納期を{quote.delivery_kind === "confirmed" ? DELIVERY_KIND_LABEL.estimate : DELIVERY_KIND_LABEL.confirmed}にする</Button>
            <a href={`/api/quotes/${quote.id}/excel`} className="block text-center rounded-md border border-line bg-surface px-3.5 py-2 text-sm font-medium">Excel 見積書を保存</a>
            <Link href={`/quotes/${quote.id}/print`} className="block text-center rounded-md border border-line bg-surface px-3.5 py-2 text-sm font-medium">印刷用・PDF に保存</Link>
            {quote.status === "won" && <a href={`/api/quotes/${quote.id}/keijo`} className="block text-center rounded-md border border-line bg-surface px-3.5 py-2 text-sm font-medium">計上指示 Excel</a>}
          </div>
        </Modal>
      )}
      {sheet === "lost" && <LostSheet busy={busy === "status"} onClose={() => setSheet(null)} onConfirm={(reason, detail) => setStatus("lost", { lost_reason: reason, lost_detail: detail })} />}
      {followup && <FollowupModal quoteId={quote.id} quoteNo={quote.quote_no} onClose={() => setFollowup(false)} onRecorded={() => router.refresh()} />}
    </div>
  );
}

function ItemCard({ item: it, line, isOpen, onToggle, edit, onEdit, onReset }: { item: QuoteWithItems["items"][number]; line: LineCheck | undefined; isOpen: boolean; onToggle: () => void; edit?: { unit_price: number; cost: number }; onEdit: (v: { unit_price: number; cost: number }) => void; onReset: () => void }) {
  const price = edit?.unit_price ?? it.unit_price;
  const cost = edit?.cost ?? it.cost;
  const m = price ? ((price - cost) / price) * 100 : 0;
  const p = line?.draft.proposal ?? null;
  const last = p?.last_same_customer ?? null;
  const diffPct = last ? ((price - last.unit_price) / last.unit_price) * 100 : null;
  const lvl = worst(line?.checks ?? []);
  const ruleNow = p?.rule && cost > 0 ? rulePrice(cost, p.rule) : null;
  const set = (patch: Partial<{ unit_price: number; cost: number }>) => onEdit({ unit_price: price, cost, ...patch });
  return (
    <div className={`bg-surface border rounded-lg ${lvl === "danger" ? "border-red-300" : lvl === "warn" ? "border-amber-300" : "border-line"} ${edit ? "ring-2 ring-brand/30" : ""}`}>
      <button type="button" className="w-full text-left p-3" onClick={onToggle}>
        <div className="flex justify-between gap-2">
          <div className="font-medium text-sm leading-snug">{it.description}</div>
          <div className="num text-sm font-semibold shrink-0">{yen(it.qty * price)}</div>
        </div>
        <div className="mt-1 text-xs num flex flex-wrap gap-x-3 gap-y-0.5">
          <span>{it.qty} {it.unit} × <b>{yen(price)}</b></span>
          <span className={m < 0 ? "text-danger font-bold" : m < 15 ? "text-warn" : "text-muted"}>粗利 {pct(m, 0)}</span>
          {diffPct !== null && <span className={diffPct < -0.5 ? "text-warn" : diffPct > 0.5 ? "text-info" : "text-muted"}>前回比 {diffPct > 0 ? "+" : ""}{diffPct.toFixed(1)}%</span>}
          {!last && it.product_id && <span className="text-info">初回</span>}
        </div>
        <div className="flex flex-wrap gap-1 mt-1.5">
          {line?.checks.length ? line.checks.map((c) => <LevelBadge key={c.code} level={c.level}>{c.title}</LevelBadge>) : it.product_id ? <LevelBadge level="ok">OK</LevelBadge> : <span className="text-[11px] text-muted">未登録品</span>}
        </div>
      </button>
      {isOpen && (
        <div className="border-t border-line p-3 text-xs space-y-3">
          {p && (
            <div className="space-y-1">
              <p className="text-muted">{p.proposal_basis}</p>
              {line?.checks.map((c) => <p key={c.code}><b>{c.title}</b>：{c.detail}</p>)}
              <div className="flex flex-wrap gap-x-3 num text-muted">
                <span>値引き下限 <b className="text-warn">{yen(p.floor_price)}</b></span>
                <span>最安仕入れ {yen(p.best_cost)} {p.best_supplier_name ?? ""}</span>
                {p.other_customers && <span>他社向け {yen(p.other_customers.min)}〜{yen(p.other_customers.max)}</span>}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div><label className={labelCls}>仕入れ単価</label><input type="number" inputMode="decimal" className={`${inputCls} num text-right`} value={cost} onChange={(e) => set({ cost: Number(e.target.value) })} /></div>
            <div><label className={labelCls}>売単価</label><input type="number" inputMode="decimal" className={`${inputCls} num text-right ${lvl === "danger" ? "border-danger" : ""}`} value={price} onChange={(e) => set({ unit_price: Number(e.target.value) })} /></div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {p && p.proposed_price !== price && <Button size="sm" onClick={() => set({ unit_price: p.proposed_price })}>提案 {yen(p.proposed_price)}</Button>}
            {ruleNow && ruleNow !== price && <Button size="sm" onClick={() => set({ unit_price: ruleNow })}>いつもの{p!.rule!.mode === "markup" ? "掛率" : "粗利"} {yen(ruleNow)}</Button>}
            {p?.floor_price && p.floor_price !== price && <Button size="sm" onClick={() => set({ unit_price: p.floor_price! })}>下限 {yen(p.floor_price)}</Button>}
            {edit && <Button size="sm" variant="ghost" onClick={onReset}>元に戻す</Button>}
          </div>
          {p?.rule && <p className="text-muted">{p.rule.label}</p>}
          {it.supplier && <p className="text-muted">仕入れ先: {it.supplier.name}{it.supplier_delivery ? `（納期回答 ${dateJp(it.supplier_delivery)}）` : "（納期回答待ち）"}</p>}
          <SupplierQuoteForm quoteId={it.quote_id} item={it} ruleLabel={p?.rule?.label ?? null} />
        </div>
      )}
    </div>
  );
}

/** メーカー回答を入れる：単価・納期・有効期限・最小ロット。回答メールを貼れば AI（無ければ簡易抽出）で埋め、「いつもの掛率で値付け」まで 1 回で終える。 */
function SupplierQuoteForm({ quoteId, item, ruleLabel }: { quoteId: number; item: QuoteWithItems["items"][number]; ruleLabel: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ price: item.supplier_quote_price != null ? String(item.supplier_quote_price) : "", delivery: item.supplier_delivery ?? "", valid_until: item.supplier_quote_valid_until ?? "", min_lot: item.supplier_quote_min_lot != null ? String(item.supplier_quote_min_lot) : "", note: item.supplier_quote_note ?? "" });
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const extract = async () => {
    setBusy("extract"); setErr(null);
    try {
      const r = await fetch("/api/supplier-reply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: paste, context: `${item.description} × ${item.qty}${item.unit}` }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error ?? "読み取れませんでした");
      setF({ price: j.unit_price != null ? String(j.unit_price) : f.price, delivery: j.delivery ?? f.delivery, valid_until: j.valid_until ?? f.valid_until, min_lot: j.min_lot != null ? String(j.min_lot) : f.min_lot, note: j.note ?? f.note });
      setMsg(j.ai_used ? "読み取りました" : "読み取りました（AI 未接続）");
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };
  const save = async (applyRule: boolean) => {
    setBusy(applyRule ? "apply" : "save"); setErr(null); setMsg(null);
    try {
      const r = await fetch(`/api/quotes/${quoteId}/items/${item.id}/supplier-quote`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ price: f.price.trim() ? Number(f.price.replace(/,/g, "")) : null, delivery: f.delivery || null, valid_until: f.valid_until || null, min_lot: f.min_lot.trim() ? Number(f.min_lot) : null, note: f.note || null, apply_rule: applyRule }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error ?? "保存できませんでした");
      setMsg(j.applied_unit_price ? `売単価を ${yen(j.applied_unit_price)} にしました（${j.rule?.label ?? ""}）` : j.rule_price ? `保存しました。いつもの掛率なら ${yen(j.rule_price)}` : "保存しました");
      router.refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };
  if (!open) return <button type="button" className="text-brand font-semibold" onClick={() => setOpen(true)}>📩 メーカー回答を入れる{item.supplier_quote_at ? `　前回 ${dateJp(item.supplier_quote_at)}` : ""}</button>;
  return (
    <div className="rounded-md border border-line bg-bg p-2 space-y-2">
      <div className="font-semibold">メーカー回答を入れる</div>
      <textarea className={`${inputCls} h-16 font-sans`} placeholder="回答メールを貼り付け" value={paste} onChange={(e) => setPaste(e.target.value)} />
      <Button size="sm" busy={busy === "extract"} disabled={!paste.trim()} onClick={extract}>読み取る</Button>
      <div className="grid grid-cols-2 gap-2">
        <div><label className={labelCls}>仕入れ単価（円）</label><input inputMode="decimal" className={`${inputCls} num text-right`} value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></div>
        <div><label className={labelCls}>最小ロット</label><input inputMode="numeric" className={`${inputCls} num text-right`} value={f.min_lot} onChange={(e) => setF({ ...f, min_lot: e.target.value })} /></div>
        <div><label className={labelCls}>納期（出荷・納品日）</label><input type="date" className={inputCls} value={f.delivery} onChange={(e) => setF({ ...f, delivery: e.target.value })} /></div>
        <div><label className={labelCls}>回答の有効期限</label><input type="date" className={inputCls} value={f.valid_until} onChange={(e) => setF({ ...f, valid_until: e.target.value })} /></div>
      </div>
      <input className={inputCls} placeholder="条件メモ（送料別・在庫限り など）" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="primary" busy={busy === "apply"} onClick={() => save(true)} disabled={!ruleLabel && !f.price.trim()} >{ruleLabel ? "いつもの掛率で値付け" : "保存"}</Button>
        <Button size="sm" busy={busy === "save"} onClick={() => save(false)}>単価そのままで保存</Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>閉じる</Button>
      </div>
      {ruleLabel && <p className="text-muted">{ruleLabel}</p>}
      {msg && <p className="text-ok">{msg}</p>}
      {err && <p className="text-danger">{err}</p>}
    </div>
  );
}

function ProvisionalSheet({ quote, onClose, onDone }: { quote: QuoteWithItems; onClose: () => void; onDone: () => void }) {
  const [channel, setChannel] = useState<ProvisionalChannel>("sms");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/quotes/${quote.id}/provisional?channel=${channel}`).then((r) => r.json()).then((j) => { if (alive && j.text) setText(j.text); }).catch(() => {});
    return () => { alive = false; };
  }, [quote.id, channel]);
  const share = async () => { try { if (navigator.share) await navigator.share({ text }); else await navigator.clipboard.writeText(text); } catch { /* cancelled */ } };
  const record = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/quotes/${quote.id}/provisional`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel, text }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "失敗しました");
      onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  return (
    <Modal title="暫定で回答" onClose={onClose}>
      <div className="grid grid-cols-4 gap-1 mb-2">
        {(Object.keys(PROVISIONAL_CHANNEL_LABEL) as ProvisionalChannel[]).map((k) => (
          <button key={k} type="button" onClick={() => setChannel(k)} className={`rounded-md border px-1 py-1.5 text-xs ${channel === k ? "bg-brand text-brand-ink border-brand font-semibold" : "border-line"}`}>{PROVISIONAL_CHANNEL_LABEL[k].replace(/（.*）/, "")}</button>
        ))}
      </div>
      <textarea className={`${inputCls} h-48 font-sans`} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="mt-3 flex flex-wrap gap-2">
        <CopyButton text={text} label="文面をコピー" />
        <Button size="sm" onClick={share}>共有（SMS・LINE へ）</Button>
      </div>
      {err && <p className="text-sm text-danger mt-2">{err}</p>}
      <Button variant="primary" className="w-full justify-center mt-4" busy={busy} onClick={record}>{PROVISIONAL_CHANNEL_LABEL[channel].replace(/（.*）/, "")}で回答済み</Button>
    </Modal>
  );
}

function SelfMailSheet({ quote, onClose, onDone }: { quote: QuoteWithItems; onClose: () => void; onDone: () => void }) {
  const [pkg, setPkg] = useState<(SelfMailPackage & { smtp: boolean; to: string | null; proxy?: { allowed: boolean; reason: string | null; to: string | null } }) | null>(null);
  const [showBody, setShowBody] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [proxyStep, setProxyStep] = useState<0 | 1>(0);
  const [proxyChecked, setProxyChecked] = useState(false);
  /** 代理送付：許可ユーザーが内容を確認し、チェックを入れて押したときだけ得意先へ送る。 */
  const sendProxy = async () => {
    setBusy("proxy"); setErr(null);
    try {
      const r = await fetch(`/api/quotes/${quote.id}/send-self`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "customer", confirm: true }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "送信に失敗しました");
      setMsg(`${j.to} へ送信しました（CC ${j.cc ?? "-"}）`);
      setTimeout(onDone, 1500);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };
  useEffect(() => { fetch(`/api/quotes/${quote.id}/send-self`).then((r) => r.json()).then(setPkg).catch(() => setErr("文面の作成に失敗しました")); }, [quote.id]);
  const mailto = useMemo(() => pkg ? `mailto:${encodeURIComponent(pkg.to ?? "")}?subject=${encodeURIComponent(pkg.subject)}&body=${encodeURIComponent(pkg.body.slice(0, 1800))}` : "#", [pkg]);
  const send = async () => {
    setBusy("send"); setErr(null);
    try {
      const r = await fetch(`/api/quotes/${quote.id}/send-self`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "formal" }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "送信に失敗しました");
      setMsg(`${j.to} に送信しました`);
      setTimeout(onDone, 1200);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };
  const shareExcel = async () => {
    setBusy("share"); setErr(null);
    try {
      const r = await fetch(`/api/quotes/${quote.id}/excel`);
      const blob = await r.blob();
      const file = new File([blob], `見積書_${quote.quote_no}_${quote.customer.short_name}.xlsx`, { type: blob.type });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: pkg?.subject, text: pkg?.customer_body });
      else { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = file.name; a.click(); }
    } catch { /* cancelled */ } finally { setBusy(null); }
  };
  return (
    <Modal title="自分宛てに送る" onClose={onClose}>
      {!pkg ? <p className="text-sm text-muted">文面を作成中…</p> : (
        <div className="space-y-3 text-sm">
          <div className="rounded-md bg-bg p-3 text-xs">
            <div><span className="text-muted">宛先：</span>{pkg.to ?? <span className="text-warn">未設定（設定でユーザーのメールを登録）</span>}</div>
            <div className="mt-1"><span className="text-muted">件名：</span>{pkg.subject}</div>
            <div className="mt-1 text-muted">添付：見積書（Excel）</div>
          </div>
          {pkg.smtp ? (
            <Button variant="primary" className="w-full justify-center" busy={busy === "send"} onClick={send} disabled={!pkg.to}>自分宛てにメール送信</Button>
          ) : (
            <div className="space-y-2">
              <Button variant="primary" className="w-full justify-center" busy={busy === "share"} onClick={shareExcel}>見積書を共有</Button>
              <a href={mailto} className="block text-center rounded-md border border-line bg-surface px-3.5 py-2 text-sm font-medium">メールアプリで開く</a>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <CopyButton text={`件名: ${pkg.customer_subject}\n\n${pkg.customer_body}`} label="得意先向け文面をコピー" />
            <button type="button" className="text-xs text-brand" onClick={() => setShowBody(!showBody)}>{showBody ? "本文を閉じる" : "本文を確認"}</button>
          </div>
          {showBody && <pre className="whitespace-pre-wrap bg-bg rounded-md p-3 text-xs font-sans max-h-64 overflow-y-auto">{pkg.body}</pre>}
          {pkg.proxy?.allowed && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs space-y-2">
              <div className="font-semibold text-red-800">代理送付（得意先へ直接）</div>
              {proxyStep === 0 ? (
                <Button size="sm" variant="danger" onClick={() => setProxyStep(1)}>内容を確認</Button>
              ) : (
                <>
                  <div>宛先：<b>{pkg.proxy.to}</b>　CC：{pkg.to ?? "-"}</div>
                  <div>件名：{pkg.customer_subject}</div>
                  <pre className="whitespace-pre-wrap bg-white rounded p-2 font-sans max-h-40 overflow-y-auto">{pkg.customer_body}</pre>
                  <div>添付：見積書（Excel）</div>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={proxyChecked} onChange={(e) => setProxyChecked(e.target.checked)} />宛先・金額・文面を確認した</label>
                  <div className="flex gap-2"><Button size="sm" variant="danger" busy={busy === "proxy"} disabled={!proxyChecked} onClick={sendProxy}>得意先へ送信する</Button><Button size="sm" variant="ghost" onClick={() => { setProxyStep(0); setProxyChecked(false); }}>やめる</Button></div>
                </>
              )}
            </div>
          )}
          {msg && <p className="text-ok">{msg}</p>}
          {err && <p className="text-danger">{err}</p>}
        </div>
      )}
    </Modal>
  );
}

function LostSheet({ busy, onClose, onConfirm }: { busy: boolean; onClose: () => void; onConfirm: (reason: LostReason, detail: string) => void }) {
  const [reason, setReason] = useState<LostReason>("price");
  const [detail, setDetail] = useState("");
  return (
    <Modal title="失注として記録" onClose={onClose}>
      <label className={labelCls}>理由</label>
      <select className={inputCls} value={reason} onChange={(e) => setReason(e.target.value as LostReason)}>{(Object.keys(LOST_REASON_LABEL) as LostReason[]).map((k) => <option key={k} value={k}>{LOST_REASON_LABEL[k]}</option>)}</select>
      <label className={`${labelCls} mt-3`}>詳細</label>
      <textarea className={`${inputCls} h-20`} value={detail} onChange={(e) => setDetail(e.target.value)} />
      <div className="flex justify-end gap-2 mt-4"><Button onClick={onClose}>やめる</Button><Button variant="danger" busy={busy} onClick={() => onConfirm(reason, detail)}>失注で確定</Button></div>
    </Modal>
  );
}

export type { DraftItem };
