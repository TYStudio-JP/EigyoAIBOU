"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ImportKind, ImportPreview, ImportResult } from "@eigyo/core/shared";
import { IMPORT_KIND_LABEL } from "@eigyo/core/shared";
import { Button, inputCls, labelCls } from "./ui";

/** マスタ取り込み：CSV を選ぶ → 列の対応を確認 → 取り込み。列の対応は種別ごとに保存され次回から自動で当たる。 */
export function ImportPanel() {
  const router = useRouter();
  const [kind, setKind] = useState<ImportKind>("customers");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const send = async (mode: "preview" | "commit") => {
    if (!file) { setErr("CSV ファイルを選んでください"); return; }
    setBusy(mode); setErr(null); if (mode === "preview") setResult(null);
    try {
      const fd = new FormData(); fd.append("file", file); fd.append("kind", kind); fd.append("mode", mode); if (mode === "commit") fd.append("mapping", JSON.stringify(mapping));
      const r = await fetch("/api/import", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "失敗しました");
      if (mode === "preview") { setPreview(j); setMapping(j.mapping); } else { setResult(j); router.refresh(); }
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };
  const missing = preview ? preview.fields.filter((f) => f.required && !mapping[f.key]) : [];
  return (
    <div className="text-sm space-y-3">
      <div className="grid sm:grid-cols-3 gap-3 items-end">
        <div><label className={labelCls}>取り込むもの</label><select className={inputCls} value={kind} onChange={(e) => { setKind(e.target.value as ImportKind); setPreview(null); setResult(null); }}>{(Object.keys(IMPORT_KIND_LABEL) as ImportKind[]).map((k) => <option key={k} value={k}>{IMPORT_KIND_LABEL[k]}</option>)}</select></div>
        <div><label className={labelCls}>CSV ファイル</label><input type="file" accept=".csv,.txt,.tsv,text/csv" className="text-xs" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); setResult(null); }} /></div>
        <div><Button variant="primary" busy={busy === "preview"} onClick={() => send("preview")} disabled={!file}>読み込む</Button></div>
      </div>
      {preview && (
        <div className="rounded-md border border-line p-3 space-y-3">
          <div className="text-xs text-muted">{preview.total} 行（＊は必須）</div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {preview.fields.map((f) => (
              <div key={f.key}>
                <label className={labelCls}>{f.label}{f.required ? " ＊" : ""}{f.hint ? <span className="text-muted">（{f.hint}）</span> : null}</label>
                <select className={`${inputCls} ${f.required && !mapping[f.key] ? "border-danger" : ""}`} value={mapping[f.key] ?? ""} onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value })}>
                  <option value="">— 使わない —</option>
                  {preview.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="text-xs min-w-full"><thead><tr>{preview.headers.map((h) => <th key={h} className="text-left font-normal text-muted px-2 py-1 whitespace-nowrap border-b border-line">{h}</th>)}</tr></thead>
              <tbody>{preview.sample.map((r, i) => <tr key={i}>{preview.headers.map((_, j) => <td key={j} className="px-2 py-1 whitespace-nowrap border-b border-line">{r[j] ?? ""}</td>)}</tr>)}</tbody></table>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="primary" busy={busy === "commit"} onClick={() => send("commit")} disabled={missing.length > 0}>取り込む</Button>
            {missing.length > 0 && <span className="text-xs text-danger">未対応: {missing.map((f) => f.label).join("、")}</span>}
          </div>
        </div>
      )}
      {result && (
        <div className="rounded-md border border-line bg-bg p-3 text-xs">
          <div className="font-semibold">{IMPORT_KIND_LABEL[result.kind]}：{result.total} 行中　追加 {result.inserted}・更新 {result.updated}・スキップ {result.skipped}</div>
          {result.errors.length > 0 && <ul className="mt-1 text-danger list-disc pl-4 max-h-40 overflow-y-auto">{result.errors.slice(0, 50).map((e, i) => <li key={i}>{e}</li>)}{result.errors.length > 50 && <li>…ほか {result.errors.length - 50} 件</li>}</ul>}
        </div>
      )}
      {err && <p className="text-danger">{err}</p>}
    </div>
  );
}
