"use client";
import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Activity, LostReason, PriceCheck, QuoteReview, QuoteStatus, QuoteWithItems } from "@eigyo/core/shared";
import { LOST_REASON_LABEL } from "@eigyo/core/shared";
import type { DraftItem } from "@/lib/draft";
import { Button, Card, LevelBadge, StatusBadge, inputCls, labelCls } from "./ui";
import { ItemsEditor, ProposalDetail, worst } from "./items-editor";
import { FollowupModal } from "./followup-modal";
import { InquiryModal } from "./inquiry-modal";
import { Modal } from "./modal";
import { dateJp, pct, yen } from "@/lib/format";

export interface LineCheck { line_no: number; checks: PriceCheck[]; draft: DraftItem }

const FLOW: Record<QuoteStatus, { next: QuoteStatus; label: string }[]> = {
  draft: [{ next: "submitted", label: "提出済にする" }],
  submitted: [{ next: "tracking", label: "追跡中にする" }, { next: "won", label: "受注！" }, { next: "lost", label: "失注…" }],
  tracking: [{ next: "won", label: "受注！" }, { next: "lost", label: "失注…" }],
  won: [{ next: "tracking", label: "追跡中に戻す" }],
  lost: [{ next: "tracking", label: "追跡中に戻す" }],
};

export function QuoteDetail({ quote, activities, lines, aiEnabled }: { quote: QuoteWithItems; activities: Activity[]; lines: LineCheck[]; aiEnabled: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState<DraftItem[]>(lines.map((l) => l.draft));
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [review, setReview] = useState<QuoteReview | null>(null);
  const [followup, setFollowup] = useState(false);
  const [lost, setLost] = useState(false);
  const [lostReason, setLostReason] = useState<LostReason>("price");
  const [lostDetail, setLostDetail] = useState("");
  const [note, setNote] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [inquiry, setInquiry] = useState<DraftItem | null>(null);
  const onItems = useCallback((v: DraftItem[]) => setItems(v), []);

  const api = async (label: string, fn: () => Promise<Response>) => {
    setBusy(label); setErr(null);
    try {
      const r = await fn();
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "失敗しました");
      return j;
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); return null; } finally { setBusy(null); }
  };
  const setStatus = async (status: QuoteStatus, extra: Record<string, unknown> = {}) => {
    const j = await api("status", () => fetch(`/api/quotes/${quote.id}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, ...extra }) }));
    if (j) { setLost(false); router.refresh(); }
  };
  const saveItems = async () => {
    const payload = items.filter((it) => it.description.trim()).map((it) => ({ product_id: it.product_id, description: it.description, qty: it.qty, unit: it.unit, unit_price: it.unit_price, cost: it.cost, supplier_id: it.supplier_id, remarks: it.remarks }));
    const j = await api("items", () => fetch(`/api/quotes/${quote.id}/items`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: payload }) }));
    if (j) { setEditing(false); router.refresh(); }
  };
  const runReview = async () => {
    const j = await api("review", () => fetch(`/api/quotes/${quote.id}/review`, { method: "POST" }));
    if (j) { setReview(j.review); router.refresh(); }
  };
  const addNote = async () => {
    if (!note.trim()) return;
    const j = await api("note", () => fetch(`/api/quotes/${quote.id}/activities`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "followup", body: note }) }));
    if (j) { setNote(""); router.refresh(); }
  };
  const overall = worst(lines.flatMap((l) => l.checks));
  const tax = Math.round(quote.total * 0.1);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3"><h1 className="text-2xl font-bold num">{quote.quote_no}</h1><StatusBadge status={quote.status} />{overall !== "ok" && <LevelBadge level={overall}>{{ info: "参考情報あり", warn: "要確認あり", danger: "赤字あり", ok: "" }[overall]}</LevelBadge>}</div>
          <div className="text-sm mt-1"><Link href={`/customers/${quote.customer.id}`} className="font-medium hover:underline">{quote.customer.name}</Link><span className="text-muted">　{quote.customer.contact_name ?? ""}　／　{quote.subject}</span></div>
          <div className="text-xs text-muted mt-1">作成 {dateJp(quote.created_at)} ／ 提出 {dateJp(quote.submitted_at)} ／ 有効期限 {dateJp(quote.valid_until)} ／ 希望納期 <b className="text-ink">{dateJp(quote.requested_delivery)}</b> ／ 回答納期 <b className="text-ink">{dateJp(quote.promised_delivery)}</b></div>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <a href={`/api/quotes/${quote.id}/excel`} className="inline-flex items-center rounded-md border border-line bg-surface px-3.5 py-2 text-sm font-medium hover:bg-bg">Excel 見積書</a>
          <Button onClick={() => window.print()}>印刷</Button>
          {FLOW[quote.status].map((f) => (
            <Button key={f.next} variant={f.next === "won" ? "primary" : f.next === "lost" ? "danger" : "secondary"} busy={busy === "status"} onClick={() => (f.next === "lost" ? setLost(true) : setStatus(f.next))}>{f.label}</Button>
          ))}
        </div>
      </div>
      {err && <p className="text-sm text-danger">{err}</p>}
      {quote.status === "lost" && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">失注理由: <b>{LOST_REASON_LABEL[quote.lost_reason ?? "other"]}</b>　{quote.lost_detail}</div>}

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card title="明細" action={
            <div className="no-print flex gap-2">
              {editing ? <><Button size="sm" onClick={() => { setEditing(false); setItems(lines.map((l) => l.draft)); }}>取消</Button><Button size="sm" variant="primary" busy={busy === "items"} onClick={saveItems}>保存</Button></> : <Button size="sm" onClick={() => setEditing(true)}>明細を編集</Button>}
            </div>
          }>
            {editing ? <ItemsEditor customerId={quote.customer_id} items={items} onChange={onItems} excludeQuoteId={quote.id} onInquiry={setInquiry} /> : (
              <>
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted"><tr><th className="text-left font-normal py-1 w-8">#</th><th className="text-left font-normal">品名</th><th className="text-right font-normal px-2">数量</th><th className="text-right font-normal px-2">単価</th><th className="text-right font-normal px-2">金額</th><th className="text-right font-normal px-2">原価</th><th className="text-right font-normal px-2">粗利</th><th className="text-left font-normal pl-3 no-print w-44">チェック</th></tr></thead>
                  <tbody>
                    {quote.items.map((it, i) => {
                      const lc = lines[i];
                      const m = it.unit_price ? ((it.unit_price - it.cost) / it.unit_price) * 100 : 0;
                      return (
                        <ItemRows key={it.id}>
                          <tr className="border-t border-line align-top">
                            <td className="py-2 text-muted num">{it.line_no}</td>
                            <td className="py-2">{it.description}{it.product?.spec && <span className="text-xs text-muted">　{it.product.spec}</span>}{it.remarks && <div className="text-xs text-muted">備考: {it.remarks}</div>}{it.supplier && <div className="text-xs text-muted no-print">仕入れ: {it.supplier.name}{it.supplier_delivery ? `（納期回答 ${dateJp(it.supplier_delivery)}）` : ""}</div>}</td>
                            <td className="py-2 px-2 text-right num whitespace-nowrap">{it.qty} {it.unit}</td>
                            <td className="py-2 px-2 text-right num whitespace-nowrap">{yen(it.unit_price)}</td>
                            <td className="py-2 px-2 text-right num whitespace-nowrap">{yen(it.qty * it.unit_price)}</td>
                            <td className="py-2 px-2 text-right num text-muted whitespace-nowrap">{yen(it.cost)}</td>
                            <td className={`py-2 px-2 text-right num whitespace-nowrap ${m < 0 ? "text-danger font-bold" : m < 15 ? "text-warn" : ""}`}>{pct(m, 0)}</td>
                            <td className="py-2 pl-3 no-print">
                              <div className="flex flex-wrap gap-1">{lc?.checks.length ? lc.checks.map((c) => <LevelBadge key={c.code} level={c.level}>{c.title}</LevelBadge>) : it.product_id ? <LevelBadge level="ok">OK</LevelBadge> : <span className="text-xs text-muted">未登録品</span>}</div>
                              {lc?.draft.proposal && <button type="button" className="text-[11px] text-brand hover:underline mt-1" onClick={() => setOpen(open === i ? null : i)}>{open === i ? "閉じる" : "根拠・履歴"}</button>}
                            </td>
                          </tr>
                          {open === i && lc?.draft.proposal && <tr className="bg-bg/60 no-print"><td /><td colSpan={7} className="px-2 py-3"><ProposalDetail item={lc.draft} onInquiry={setInquiry} /></td></tr>}
                        </ItemRows>
                      );
                    })}
                  </tbody>
                </table>
                <div className="flex justify-end gap-6 mt-3 text-sm">
                  <span className="text-muted">原価 <span className="num">{yen(quote.total_cost)}</span></span>
                  <span className={quote.margin_pct < 15 ? "text-warn" : "text-ok"}>粗利率 <span className="num font-semibold">{pct(quote.margin_pct)}</span></span>
                  <span>小計 <span className="num">{yen(quote.total)}</span></span>
                  <span className="text-muted">消費税 <span className="num">{yen(tax)}</span></span>
                  <span className="font-bold text-base">合計 <span className="num">{yen(quote.total + tax)}</span></span>
                </div>
              </>
            )}
            {quote.notes && <div className="mt-3 text-xs text-muted border-t border-line pt-2">備考: {quote.notes}</div>}
          </Card>

          <Card className="no-print" title="提出前レビュー（営業AI棒）" action={<Button size="sm" variant="primary" busy={busy === "review"} onClick={runReview} disabled={!aiEnabled} title={aiEnabled ? "" : "API キー未設定"}>AI にレビューさせる</Button>}>
            {review ? (
              <div className="text-sm space-y-2">
                <div><LevelBadge level={review.verdict === "ok" ? "ok" : review.verdict === "caution" ? "warn" : "danger"}>{{ ok: "そのまま提出可", caution: "要確認", stop: "提出前に修正" }[review.verdict]}</LevelBadge></div>
                <p>{review.summary}</p>
                {review.actions.length > 0 && <ul className="list-disc pl-5">{review.actions.map((a, i) => <li key={i}>{a}</li>)}</ul>}
                <div className="rounded-md bg-bg p-3 text-xs"><b>備考欄の提案:</b> {review.remarks_suggestion}</div>
              </div>
            ) : (
              <p className="text-sm text-muted">機械チェック（前回単価・粗利・仕入れルート・他社売価）の結果を読み、提出して良いか・何を直すべきかを要約します。</p>
            )}
          </Card>

          {quote.source_text && <Card className="no-print" title={`元の依頼（${{ email: "メール", memo: "メモ", file: "添付", manual: "手入力", mcp: "Claude Code" }[quote.source_type] ?? quote.source_type}）`}><pre className="whitespace-pre-wrap text-xs text-muted font-sans">{quote.source_text}</pre></Card>}
        </div>

        <div className="space-y-4 no-print">
          <Card title="フォロー">
            {(quote.status === "submitted" || quote.status === "tracking") ? (
              <div className="space-y-2">
                <Button variant="primary" className="w-full justify-center" onClick={() => setFollowup(true)} disabled={!aiEnabled} title={aiEnabled ? "" : "API キー未設定"}>AI でフォロー文面を作る</Button>
                <textarea className={`${inputCls} h-20`} placeholder="フォロー記録（電話・訪問・メールの内容）" value={note} onChange={(e) => setNote(e.target.value)} />
                <Button className="w-full justify-center" busy={busy === "note"} onClick={addNote}>記録する</Button>
              </div>
            ) : <p className="text-sm text-muted">{quote.status === "draft" ? "提出済にするとフォロー機能が使えます。" : "決着済みの案件です。"}</p>}
          </Card>
          <Card title="経緯">
            <ul className="space-y-2 text-xs">
              {activities.map((a) => (
                <li key={a.id} className="flex gap-2"><span className="text-muted num shrink-0">{a.created_at.slice(5, 16)}</span><span className={`shrink-0 rounded px-1 ${{ followup: "bg-amber-50 text-amber-800", ai: "bg-blue-50 text-blue-700", status: "bg-gray-100 text-gray-700", created: "bg-gray-100 text-gray-700", note: "bg-gray-100 text-gray-700" }[a.kind] ?? "bg-gray-100"}`}>{{ followup: "フォロー", ai: "AI", status: "状態", created: "作成", note: "メモ" }[a.kind] ?? a.kind}</span><span>{a.body}</span></li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      {followup && <FollowupModal quoteId={quote.id} quoteNo={quote.quote_no} onClose={() => setFollowup(false)} onRecorded={() => router.refresh()} />}
      {inquiry && <InquiryModal item={inquiry} requestedDelivery={quote.requested_delivery} onClose={() => setInquiry(null)} />}
      {lost && (
        <Modal title="失注として記録" onClose={() => setLost(false)}>
          <label className={labelCls}>理由（次回提案の改善に使います）</label>
          <select className={inputCls} value={lostReason} onChange={(e) => setLostReason(e.target.value as LostReason)}>{(Object.keys(LOST_REASON_LABEL) as LostReason[]).map((k) => <option key={k} value={k}>{LOST_REASON_LABEL[k]}</option>)}</select>
          <label className={`${labelCls} mt-3`}>詳細</label>
          <textarea className={`${inputCls} h-20`} value={lostDetail} onChange={(e) => setLostDetail(e.target.value)} placeholder="例）他社が1割安かった。納期は問題なし。" />
          <div className="flex justify-end gap-2 mt-4"><Button onClick={() => setLost(false)}>やめる</Button><Button variant="danger" busy={busy === "status"} onClick={() => setStatus("lost", { lost_reason: lostReason, lost_detail: lostDetail })}>失注で確定</Button></div>
        </Modal>
      )}
    </div>
  );
}

function ItemRows({ children }: { children: React.ReactNode }) { return <>{children}</>; }
