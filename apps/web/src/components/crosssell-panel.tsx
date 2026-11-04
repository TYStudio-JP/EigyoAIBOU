"use client";
import { useState } from "react";
import Link from "next/link";
import type { CrossSellResult, ProposalDraft } from "@eigyo/core/shared";
import { Button, Card, Empty } from "./ui";
import { CopyButton } from "./modal";
import { dateJp, yen } from "@/lib/format";

export function CrossSellPanel({ result: initial, aiEnabled }: { result: CrossSellResult; aiEnabled: boolean }) {
  const [result, setResult] = useState(initial);
  const [draft, setDraft] = useState<ProposalDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showDismissed, setShowDismissed] = useState(false);
  /** 候補を「提案済み」「不要」にして一覧から消す（戻せる）。 */
  const dismiss = async (productId: number, reason: "proposed" | "not_needed") => {
    setErr(null);
    const r = await fetch(`/api/customers/${result.customer.id}/crosssell/dismiss`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ product_id: productId, reason }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error ?? "失敗しました"); return; }
    setResult(j);
  };
  const restore = async (productId: number) => {
    const r = await fetch(`/api/customers/${result.customer.id}/crosssell/dismiss`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ product_id: productId }) });
    const j = await r.json().catch(() => ({}));
    if (r.ok) setResult(j);
  };
  const run = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/customers/${result.customer.id}/proposal-draft`, { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setDraft(j);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-4">
      <Card title="横展開の候補" action={
        <Button size="sm" variant="primary" busy={busy} onClick={run} disabled={!aiEnabled || result.candidates.length === 0} title={aiEnabled ? "" : "設定で AI を接続すると使えます"}>提案トークとメールを作る</Button>
      }>
        {result.candidates.length === 0 ? <Empty>候補なし</Empty> : (
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[40rem]">
            <thead className="text-xs text-muted"><tr><th className="text-left font-normal py-1">商品</th><th className="text-left font-normal">根拠（同業の実績）</th><th className="text-right font-normal">参考売価</th><th className="text-right font-normal">最安原価</th><th className="text-right font-normal">スコア</th><th className="w-36" /></tr></thead>
            <tbody>
              {result.candidates.map((c) => (
                <tr key={c.product.id} className="border-t border-line align-top">
                  <td className="py-2"><div className="font-medium">{c.product.name}</div><div className="text-xs text-muted num">{c.product.code} / {c.product.part_number} / {c.product.category}</div></td>
                  <td className="py-2 text-xs">
                    <div>{c.reason}</div>
                    <ul className="text-muted mt-1">{c.peers.slice(0, 3).map((p) => <li key={p.customer.id}>・{p.customer.short_name}：累計 {p.total_qty}{c.product.unit}、直近 {dateJp(p.last_date)}（{yen(p.last_price)}）</li>)}</ul>
                  </td>
                  <td className="py-2 text-right num">{yen(c.reference_price)}</td>
                  <td className="py-2 text-right num text-muted">{yen(c.best_cost)}</td>
                  <td className="py-2 text-right num text-muted">{c.score.toFixed(1)}</td>
                  <td className="py-2 pl-3 text-right whitespace-nowrap"><Button size="sm" onClick={() => dismiss(c.product.id, "proposed")} title="提案したので一覧から消す">提案した</Button> <Button size="sm" variant="ghost" onClick={() => dismiss(c.product.id, "not_needed")} title="この得意先には不要">不要</Button></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
        {err && <p className="text-sm text-danger mt-2">{err}</p>}
        {result.dismissed.length > 0 && (
          <div className="mt-3 text-xs">
            <button type="button" className="text-brand hover:underline" onClick={() => setShowDismissed(!showDismissed)}>{showDismissed ? "済みを閉じる" : `済み・不要（${result.dismissed.length}）を見る`}</button>
            {showDismissed && (
              <ul className="mt-1 divide-y divide-line">
                {result.dismissed.map((d) => <li key={d.id} className="py-1 flex items-center gap-2"><span className={`rounded px-1.5 py-0.5 ${d.reason === "proposed" ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"}`}>{d.reason === "proposed" ? "提案済み" : "不要"}</span><span className="flex-1">{d.product.name} <span className="text-muted num">{dateJp(d.created_at)}{d.note ? `・${d.note}` : ""}</span></span><button type="button" className="text-brand hover:underline" onClick={() => restore(d.product_id)}>戻す</button></li>)}
              </ul>
            )}
          </div>
        )}
        <p className="text-xs text-muted mt-3">比較した同業: {result.peers.map((p) => `${p.customer.short_name}（類似度 ${(p.similarity * 100).toFixed(0)}%）`).join("、") || "なし"}</p>
      </Card>
      {draft && (
        <Card title="提案トーク（商談用）と提案メール">
          <div className="grid md:grid-cols-2 gap-5 text-sm">
            <div className="space-y-3">
              <div className="rounded-md bg-bg p-3"><div className="text-xs text-muted mb-1">切り出し</div>{draft.opening}</div>
              {draft.pitches.map((p) => (
                <div key={p.product_code} className="border border-line rounded-md p-3">
                  <div className="font-semibold">{p.headline} <span className="text-xs text-muted num">[{p.product_code}]</span></div>
                  <div className="text-xs mt-1"><b>なぜ今:</b> {p.why_now}</div>
                  <div className="text-xs mt-1 text-muted"><b>想定反論:</b> {p.objection}</div>
                </div>
              ))}
            </div>
            <div>
              <div className="flex items-center justify-between mb-1"><div className="text-xs text-muted">訪問前に送るメール</div><CopyButton text={draft.email_body} /></div>
              <pre className="whitespace-pre-wrap bg-bg rounded-md p-3 font-sans leading-relaxed">{draft.email_body}</pre>
              <Link href={`/quotes/new`} className="inline-block mt-3 text-brand text-xs hover:underline">→ この候補で見積りを作る</Link>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
