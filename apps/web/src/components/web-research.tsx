"use client";
import { useState } from "react";
import type { ResearchResult } from "@eigyo/core/shared";
import { Button, inputCls } from "./ui";
import { CopyButton } from "./modal";

type Kind = "general" | "equivalent" | "spec" | "size" | "price" | "successor";
const CHIPS: { kind: Kind; label: string; q: (name: string) => string }[] = [
  { kind: "equivalent", label: "同等品", q: (n) => `${n} の同等品・互換品` },
  { kind: "size", label: "サイズ・寸法", q: (n) => `${n} のサイズ・寸法（mm）` },
  { kind: "spec", label: "仕様・規格", q: (n) => `${n} の仕様・材質・規格` },
  { kind: "price", label: "相場", q: (n) => `${n} の価格・相場` },
  { kind: "successor", label: "後継品・廃番", q: (n) => `${n} の生産終了・後継品` },
];

/** ウェブで調べる。商品を渡すと「同等品」「サイズ」などをワンタップで聞ける。 */
export function WebResearch({ product, defaultQuery = "", context, aiEnabled, compact }: { product?: { maker?: string; part_number?: string; name: string; spec?: string } | null; defaultQuery?: string; context?: string; aiEnabled: boolean; compact?: boolean }) {
  const pname = product ? `${product.maker ?? ""} ${product.part_number ?? ""} ${product.name}`.replace(/\s+/g, " ").trim() : "";
  const [q, setQ] = useState(defaultQuery || (pname ? `${pname} の仕様` : ""));
  const [r, setR] = useState<ResearchResult | null>(null);
  const [busy, setBusy] = useState<Kind | "run" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const run = async (query: string, kind: Kind = "general") => {
    if (!query.trim()) return;
    setBusy(kind === "general" ? "run" : kind); setErr(null); setQ(query);
    try {
      const res = await fetch("/api/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, context: [context, product?.spec ? `登録されている仕様: ${product.spec}` : ""].filter(Boolean).join("\n"), kind }) });
      const j = await res.json(); if (!res.ok) throw new Error(j.error); setR(j);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };
  return (
    <div className={compact ? "" : "space-y-2"}>
      {product && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {CHIPS.map((c) => <button key={c.kind} type="button" disabled={!aiEnabled || busy !== null} onClick={() => run(c.q(pname), c.kind)} className={`rounded-full border px-3 py-1.5 text-sm ${busy === c.kind ? "bg-brand text-brand-ink border-brand" : "border-line bg-surface"}`}>{busy === c.kind ? "調べています…" : c.label}</button>)}
        </div>
      )}
      <div className="flex gap-2">
        <input className={`${inputCls} py-2.5`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="調べたいこと" onKeyDown={(e) => e.key === "Enter" && run(q)} />
        <Button variant="primary" busy={busy === "run"} onClick={() => run(q)} disabled={!aiEnabled || busy !== null} title={aiEnabled ? "" : "設定で AI を接続すると使えます"} className="whitespace-nowrap">🌐 調べる</Button>
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
