"use client";
import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Customer } from "@eigyo/core/shared";
import type { DraftItem, QuoteDraft } from "@/lib/draft";
import { Button, Card, inputCls, labelCls } from "./ui";
import { ItemsEditor, emptyItem } from "./items-editor";
import { InquiryModal } from "./inquiry-modal";

type Sample = { label: string; type: "email" | "memo"; text: string };

export function QuoteComposer({ customers, samples, aiEnabled }: { customers: Customer[]; samples: Sample[]; aiEnabled: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [sourceType, setSourceType] = useState<"email" | "memo" | "file">("email");
  const [file, setFile] = useState<File | null>(null);
  const [preCustomer, setPreCustomer] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<QuoteDraft | null>(null);
  const [inquiry, setInquiry] = useState<DraftItem | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const extract = async () => {
    setBusy(true); setErr(null);
    try {
      const fd = new FormData();
      fd.set("text", text); fd.set("source_type", sourceType);
      if (preCustomer) fd.set("customer_id", String(preCustomer));
      if (file) fd.set("file", file);
      const r = await fetch("/api/extract", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "抽出に失敗しました");
      setDraft(j);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const startManual = () => {
    setDraft({ customer_id: preCustomer ? Number(preCustomer) : null, customer_candidates: customers, subject: "", requested_delivery: null, delivery_note: null, price_pressure: null, open_questions: [], source_type: "manual", source_text: text, notes: "", items: [emptyItem()], ai_used: false });
  };
  const setItems = useCallback((items: DraftItem[]) => setDraft((d) => (d ? { ...d, items } : d)), []);

  const save = async () => {
    if (!draft) return;
    if (!draft.customer_id) { setErr("得意先を選択してください"); return; }
    const items = draft.items.filter((it) => it.description.trim() && it.qty > 0);
    if (!items.length) { setErr("明細を入力してください"); return; }
    setSaving(true); setErr(null);
    try {
      const r = await fetch("/api/quotes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        customer_id: draft.customer_id, subject: draft.subject || "見積り", requested_delivery: draft.requested_delivery, source_type: draft.source_type, source_text: draft.source_text,
        notes: draft.notes,
        items: items.map((it) => ({ product_id: it.product_id, description: it.description, qty: it.qty, unit: it.unit, unit_price: it.unit_price, cost: it.cost, supplier_id: it.supplier_id, remarks: it.remarks })),
      }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      router.push(`/quotes/${j.id}`);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setSaving(false); }
  };

  const customerList = draft ? (draft.customer_candidates.length ? draft.customer_candidates : customers) : customers;
  const showAll = draft && draft.customer_candidates.length < customers.length;

  return (
    <div className="space-y-5">
      <Card title="① 依頼をそのまま入れる" action={<span className="text-xs text-muted">{aiEnabled ? "AI が品目・数量・納期・不明点を読み取ります" : "簡易モード（API キー未設定）"}</span>}>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {(["email", "memo", "file"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setSourceType(t)} className={`text-xs rounded-full px-3 py-1 border ${sourceType === t ? "bg-brand text-brand-ink border-brand" : "border-line bg-surface"}`}>{{ email: "メール本文を貼り付け", memo: "電話・口頭のメモ", file: "Excel / PDF / 画像を添付" }[t]}</button>
          ))}
          <span className="text-xs text-muted ml-2">サンプル:</span>
          {samples.map((s) => <button key={s.label} type="button" className="text-xs text-brand hover:underline" onClick={() => { setText(s.text); setSourceType(s.type); }}>{s.label}</button>)}
        </div>
        <textarea className={`${inputCls} h-44 font-sans`} placeholder={sourceType === "memo" ? "例）東海精密 佐藤さんから電話。エンドミル φ10 を15本、切削油 18L を10缶。来月5日までに。前回より安くできないかとのこと。" : "得意先からのメール本文を貼り付けてください（件名・署名ごとでOK）"} value={text} onChange={(e) => setText(e.target.value)} />
        <div className="grid md:grid-cols-3 gap-3 mt-3 items-end">
          <div>
            <label className={labelCls}>添付ファイル（任意：xlsx / pdf / png / jpg / csv）</label>
            <input type="file" accept=".xlsx,.xlsm,.pdf,.png,.jpg,.jpeg,.webp,.csv,.txt" className="text-sm" onChange={(e) => { setFile(e.target.files?.[0] ?? null); if (e.target.files?.[0]) setSourceType("file"); }} />
          </div>
          <div>
            <label className={labelCls}>得意先が分かっている場合（任意）</label>
            <select className={inputCls} value={preCustomer} onChange={(e) => setPreCustomer(e.target.value ? Number(e.target.value) : "")}>
              <option value="">自動判定（依頼文から名寄せ）</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.code} {c.name}</option>)}
            </select>
          </div>
          <div className="flex gap-2 justify-end">
            <Button onClick={startManual}>手入力で作る</Button>
            <Button variant="primary" busy={busy} onClick={extract} disabled={!text.trim() && !file}>営業AI棒に読ませる</Button>
          </div>
        </div>
        {err && !draft && <p className="text-sm text-danger mt-2">{err}</p>}
      </Card>

      {draft && (
        <div ref={resultRef} className="space-y-4">
          <Card title="② 読み取り結果を確認して、価格を決める" action={draft.ai_used ? <span className="text-xs text-ok">AI 抽出</span> : <span className="text-xs text-muted">{draft.source_type === "manual" ? "手入力" : "簡易抽出"}</span>}>
            <div className="grid md:grid-cols-4 gap-3">
              <div className="md:col-span-1">
                <label className={labelCls}>得意先 {draft.customer_candidates.length > 1 && draft.customer_candidates.length < customers.length && <span className="text-warn">候補が複数あります</span>}</label>
                <select className={`${inputCls} ${!draft.customer_id ? "border-warn" : ""}`} value={draft.customer_id ?? ""} onChange={(e) => setDraft({ ...draft, customer_id: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">— 選択してください —</option>
                  {customerList.map((c) => <option key={c.id} value={c.id}>{c.code} {c.name}</option>)}
                </select>
                {showAll && <button type="button" className="text-[11px] text-brand hover:underline mt-1" onClick={() => setDraft({ ...draft, customer_candidates: customers })}>全得意先から選ぶ</button>}
              </div>
              <div className="md:col-span-2">
                <label className={labelCls}>件名</label>
                <input className={inputCls} value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>希望納期 {draft.delivery_note && <span className="text-muted">（原文: {draft.delivery_note}）</span>}</label>
                <input type="date" className={inputCls} value={draft.requested_delivery ?? ""} onChange={(e) => setDraft({ ...draft, requested_delivery: e.target.value || null })} />
              </div>
            </div>
            {(draft.open_questions.length > 0 || draft.price_pressure) && (
              <div className="mt-3 grid md:grid-cols-2 gap-3 text-xs">
                {draft.open_questions.length > 0 && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900"><b>得意先に確認すること</b><ul className="list-disc pl-4 mt-1">{draft.open_questions.map((q, i) => <li key={i}>{q}</li>)}</ul></div>
                )}
                {draft.price_pressure && <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-blue-900"><b>価格に関する発言</b><div className="mt-1">{draft.price_pressure}</div></div>}
              </div>
            )}
          </Card>
          <Card title="③ 明細と価格（履歴・原価・仕入れルートを自動照合）">
            {!draft.customer_id && <p className="text-xs text-warn mb-2">得意先を選ぶと、過去価格の照合と提案単価が表示されます。</p>}
            <ItemsEditor customerId={draft.customer_id} items={draft.items} onChange={setItems} onInquiry={(it) => setInquiry(it)} />
            <div className="mt-4">
              <label className={labelCls}>備考（見積書に印字）</label>
              <textarea className={`${inputCls} h-16`} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="例）納期はメーカー在庫状況により変動する場合があります。" />
            </div>
            <div className="flex items-center justify-end gap-3 mt-4">
              {err && <span className="text-sm text-danger">{err}</span>}
              <Button variant="primary" busy={saving} onClick={save}>見積りを保存して詳細へ</Button>
            </div>
          </Card>
        </div>
      )}
      {inquiry && <InquiryModal item={inquiry} requestedDelivery={draft?.requested_delivery ?? null} onClose={() => setInquiry(null)} />}
    </div>
  );
}
