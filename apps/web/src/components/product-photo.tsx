"use client";
import { useState } from "react";
import Link from "next/link";
import type { IdentifiedProduct } from "@eigyo/core/shared";
import { Button, Card, inputCls } from "./ui";
import { WebResearch } from "./web-research";
import { yen } from "@/lib/format";

export function ProductPhoto({ aiEnabled, shareToken }: { aiEnabled: boolean; shareToken: string | null }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [hint, setHint] = useState("");
  const [result, setResult] = useState<IdentifiedProduct | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pick = (f: File | null) => { setFile(f); setResult(null); if (preview) URL.revokeObjectURL(preview); setPreview(f ? URL.createObjectURL(f) : null); };
  const run = async () => {
    setBusy(true); setErr(null);
    try {
      const fd = new FormData();
      if (file) fd.append("file", file); else if (shareToken) fd.append("share_token", shareToken);
      if (hint) fd.append("hint", hint);
      const r = await fetch("/api/products/identify", { method: "POST", body: fd });
      const j = await r.json(); if (!r.ok) throw new Error(j.error ?? "読み取れませんでした");
      setResult(j);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const rd = result?.reading;
  return (
    <div className="space-y-3">
      <Card>
        <div className="space-y-2">
          <label className="block rounded-lg border-2 border-dashed border-line p-4 text-center cursor-pointer">
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
            {/* 端末内の blob URL のプレビューなので next/image は使わない */}
            {preview ? <img src={preview} alt="" className="mx-auto max-h-56 rounded" /> // eslint-disable-line @next/next/no-img-element
               : <div className="text-sm text-muted">📷 撮影 / 写真を選ぶ</div>}
          </label>
          <div><input className={inputCls} placeholder="補足（任意）" value={hint} onChange={(e) => setHint(e.target.value)} /></div>
          <Button variant="primary" className="w-full justify-center" busy={busy} disabled={!aiEnabled || (!file && !shareToken)} onClick={run} title={aiEnabled ? "" : "設定で AI を接続すると使えます"}>読み取って照合する</Button>
          {!aiEnabled && <p className="text-xs text-warn">AI 未接続</p>}
          {err && <p className="text-sm text-danger">{err}</p>}
        </div>
      </Card>
      {result && rd && (
        <>
          <Card title={`読み取り結果（確度 ${{ high: "高", medium: "中", low: "低" }[rd.confidence]}）`}>
            <dl className="grid grid-cols-3 gap-y-1 text-sm"><dt className="text-muted">メーカー</dt><dd className="col-span-2">{rd.maker ?? "—"}</dd><dt className="text-muted">品番</dt><dd className="col-span-2 num">{rd.part_number ?? "—"}</dd><dt className="text-muted">品名</dt><dd className="col-span-2">{rd.name ?? "—"}</dd><dt className="text-muted">仕様</dt><dd className="col-span-2">{rd.spec ?? "—"}</dd><dt className="text-muted">区分</dt><dd className="col-span-2">{rd.category_guess ?? "—"}</dd></dl>
            {rd.visible_text.length > 0 && <p className="text-xs text-muted mt-2">読めた文字: {rd.visible_text.join(" / ")}</p>}
          </Card>
          <Card title={`自社の取扱品との照合（${result.matches.length}）`}>
            {result.matches.length === 0 ? <p className="text-sm text-muted">一致なし</p> : (
              <ul className="divide-y divide-line text-sm">{result.matches.map((m) => <li key={m.product.id} className="py-2 flex items-center gap-2"><div className="flex-1 min-w-0"><div className="font-medium">{m.product.name}</div><div className="text-xs text-muted num">{m.product.code}・{m.product.maker} {m.product.part_number}{m.product.spec ? `・${m.product.spec}` : ""}　一致: {{ part_number: "品番", name: "品名", text: "読み取った文字" }[m.how]}</div></div>{m.best_cost != null && <span className="text-xs text-muted num">仕入 {yen(m.best_cost)}</span>}<Link href={`/quotes/new?product=${m.product.id}`} className="text-xs rounded border border-line px-2 py-1">見積りへ</Link></li>)}</ul>
            )}
            {result.similar.length > 0 && <div className="mt-3 text-xs"><div className="text-muted mb-1">同じ区分の取扱品（同等品の候補）</div><ul className="flex flex-wrap gap-1">{result.similar.map((p) => <li key={p.id} className="rounded bg-bg px-2 py-0.5">{p.name} <span className="text-muted num">{p.part_number}</span></li>)}</ul></div>}
          </Card>
          <Card title="ウェブで調べる"><WebResearch product={{ maker: rd.maker ?? "", part_number: rd.part_number ?? "", name: rd.name ?? result.research_query, spec: rd.spec ?? "" }} context={result.research_context} aiEnabled={aiEnabled} /></Card>
          <div className="text-right"><Link href={`/inquiries/new?text=${encodeURIComponent(`写真の商品について：${[rd.maker, rd.part_number, rd.name, rd.spec].filter(Boolean).join(" ")} の同等品・価格・納期`)}`} className="text-xs text-brand">この内容で問い合わせを記録 →</Link></div>
        </>
      )}
    </div>
  );
}
