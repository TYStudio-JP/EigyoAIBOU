"use client";
import { useState } from "react";
import type { ResearchResult } from "@eigyo/core/shared";
import { Button, inputCls } from "./ui";
import { CopyButton } from "./modal";

/** ウェブで調べる（商品の仕様・規格・相場・メーカー情報）。結果は出典付き。 */
export function WebResearch({ defaultQuery, context, aiEnabled, compact }: { defaultQuery: string; context?: string; aiEnabled: boolean; compact?: boolean }) {
  const [q, setQ] = useState(defaultQuery);
  const [r, setR] = useState<ResearchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => {
    if (!q.trim()) return;
    setBusy(true); setErr(null);
    try { const res = await fetch("/api/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q, context }) }); const j = await res.json(); if (!res.ok) throw new Error(j.error); setR(j); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  return (
    <div className={compact ? "" : "space-y-2"}>
      <div className="flex gap-2">
        <input className={`${inputCls} py-2.5`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="調べたいこと" onKeyDown={(e) => e.key === "Enter" && run()} />
        <Button variant="primary" busy={busy} onClick={run} disabled={!aiEnabled} title={aiEnabled ? "" : "設定で AI を接続すると使えます"} className="whitespace-nowrap">🌐 ウェブで調べる</Button>
      </div>
      {err && <p className="text-sm text-danger">{err}</p>}
      {r && (
        <div className="rounded-md bg-bg p-3 text-sm mt-2">
          <div className="flex justify-between items-start gap-2"><pre className="whitespace-pre-wrap font-sans leading-relaxed flex-1">{r.summary}</pre><CopyButton text={r.summary} /></div>
          {r.sources.length > 0 && <ul className="mt-2 space-y-0.5 text-xs">{r.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer" className="text-brand hover:underline break-all">{s.title}</a></li>)}</ul>}
        </div>
      )}
    </div>
  );
}
