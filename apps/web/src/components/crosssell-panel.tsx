"use client";
import { useState } from "react";
import Link from "next/link";
import type { CrossSellResult, ProposalDraft } from "@eigyo/core/shared";
import { Button, Card, Empty } from "./ui";
import { CopyButton } from "./modal";
import { dateJp, yen } from "@/lib/format";

export function CrossSellPanel({ result, aiEnabled }: { result: CrossSellResult; aiEnabled: boolean }) {
  const [draft, setDraft] = useState<ProposalDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
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
      <Card title={`横展開の候補 — 同業（${result.customer.industry}）で売れていて、${result.customer.short_name}が未購入の商品`} action={
        <Button size="sm" variant="primary" busy={busy} onClick={run} disabled={!aiEnabled || result.candidates.length === 0}>AI で提案トークとメールを作る</Button>
      }>
        {result.candidates.length === 0 ? <Empty>候補がありません（同業の得意先が少ないか、既に主要商品を購入済み）</Empty> : (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted"><tr><th className="text-left font-normal py-1">商品</th><th className="text-left font-normal">根拠（同業の実績）</th><th className="text-right font-normal">参考売価</th><th className="text-right font-normal">最安原価</th><th className="text-right font-normal">スコア</th></tr></thead>
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
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {err && <p className="text-sm text-danger mt-2">{err}</p>}
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
