"use client";
import { useEffect, useState } from "react";
import type { DraftItem } from "@/lib/draft";
import type { InquiryDraft } from "@eigyo/core/shared";
import { Modal, CopyButton } from "./modal";
import { Button, inputCls, labelCls } from "./ui";
import { WebResearch } from "./web-research";

export function InquiryModal({ item, requestedDelivery, onClose, aiEnabled = true }: { item: DraftItem; requestedDelivery: string | null; onClose: () => void; aiEnabled?: boolean }) {
  const sup = item.supplier_options.find((o) => o.supplier_id === item.supplier_id) ?? item.supplier_options[0];
  const [question, setQuestion] = useState(`${item.qty}${item.unit} の場合の最短納期と、現在の仕入れ単価（${sup ? sup.cost.toLocaleString() + "円" : "未確認"}）に変更がないか`);
  const [draft, setDraft] = useState<InquiryDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/inquiry-draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ supplier_name: sup?.supplier_name ?? "仕入れ先", product_desc: item.description, qty: item.qty, unit: item.unit, question, requested_delivery: requestedDelivery }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setDraft(j);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  useEffect(() => { /* no auto-run: let the user adjust the question first */ }, []);
  return (
    <Modal title={`仕入れ先への問い合わせ — ${sup?.supplier_name ?? ""}`} onClose={onClose}>
      <div className="mb-4 pb-4 border-b border-line">
        <label className={labelCls}>仕様・規格・相場を調べる</label>
        <WebResearch defaultQuery={`${item.product ? `${item.product.maker} ${item.product.part_number} ` : ""}${item.description} 仕様 規格`} context={`得意先への見積り明細: ${item.description} × ${item.qty}${item.unit}`} aiEnabled={aiEnabled} compact />
      </div>
      <label className={labelCls}>確認したいこと</label>
      <textarea className={`${inputCls} h-20`} value={question} onChange={(e) => setQuestion(e.target.value)} />
      <div className="mt-3 flex gap-2"><Button variant="primary" busy={busy} onClick={run}>下書きを作る</Button></div>
      {err && <p className="text-sm text-danger mt-2">{err}</p>}
      {draft && (
        <div className="mt-4 space-y-3 text-sm">
          <div><span className="text-xs text-muted">宛先</span><div>{draft.to}</div></div>
          <div className="flex items-center justify-between"><div><span className="text-xs text-muted">件名</span><div className="font-medium">{draft.subject}</div></div><CopyButton text={`件名: ${draft.subject}\n\n${draft.body}`} label="件名＋本文をコピー" /></div>
          <pre className="whitespace-pre-wrap bg-bg rounded-md p-3 font-sans">{draft.body}</pre>
          <div><span className="text-xs text-muted">回答が来たら確認すること</span><ul className="list-disc pl-5 mt-1">{draft.checklist.map((c, i) => <li key={i}>{c}</li>)}</ul></div>
        </div>
      )}
    </Modal>
  );
}
