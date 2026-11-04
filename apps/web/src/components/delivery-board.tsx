"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { DeliveryWaiting } from "@eigyo/core/shared";
import { DELIVERY_KIND_LABEL } from "@eigyo/core/shared";
import { Button, Card, Empty, inputCls } from "./ui";
import { Modal, CopyButton } from "./modal";
import { dateJp } from "@/lib/format";

/** 納期回答待ち：得意先・商品・見積番号で絞り込み。回答を入れると回答納期に反映。概算／確定の切替。 */
export function DeliveryBoard({ items }: { items: DeliveryWaiting[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [notice, setNotice] = useState<{ subject: string; body: string; late: boolean; quote_no: string } | null>(null);
  const filtered = useMemo(() => {
    const key = q.trim().toLowerCase();
    return items.filter(({ quote, waiting_items, overdue }) => {
      if (onlyOverdue && !overdue) return false;
      if (!key) return true;
      const hay = [quote.customer.name, quote.customer.short_name, quote.subject, quote.quote_no, ...waiting_items.flatMap((it) => [it.description, it.product?.part_number ?? "", it.supplier?.name ?? ""])].join(" ").toLowerCase();
      return hay.includes(key);
    });
  }, [items, q, onlyOverdue]);
  const record = async (quoteId: number, itemId: number, date: string) => {
    if (!date) return;
    setBusy(itemId);
    await fetch(`/api/quotes/${quoteId}/delivery`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item_id: itemId, supplier_delivery: date }) });
    setBusy(null); router.refresh();
  };
  const setKind = async (quoteId: number, kind: "estimate" | "confirmed") => {
    await fetch(`/api/quotes/${quoteId}/delivery-kind`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind }) });
    router.refresh();
  };
  const showNotice = async (quoteId: number, quoteNo: string) => {
    const r = await fetch(`/api/quotes/${quoteId}/delivery`); const j = await r.json(); setNotice({ ...j, quote_no: quoteNo });
  };
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input className={`${inputCls} max-w-xs`} placeholder="得意先・商品・品番・見積番号で検索" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={onlyOverdue} onChange={(e) => setOnlyOverdue(e.target.checked)} />希望納期が 1 週間以内だけ</label>
        <span className="text-xs text-muted ml-auto num">{filtered.length} / {items.length} 件</span>
      </div>
      <Card>
        {filtered.length === 0 ? <Empty>{items.length === 0 ? "納期回答待ちはありません" : "条件に合うものはありません"}</Empty> : (
          <ul className="divide-y divide-line">
            {filtered.map(({ quote: q, waiting_items, overdue }) => (
              <li key={q.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/quotes/${q.id}`} className="font-semibold hover:underline">{q.customer.short_name}</Link>
                  <span className="text-sm text-muted">{q.subject}</span>
                  <span className="text-xs text-muted num">{q.quote_no}</span>
                  {q.requested_delivery && <span className={`text-xs rounded px-1.5 py-0.5 ${overdue ? "bg-red-50 text-red-700" : "bg-gray-100 text-gray-700"}`}>希望納期 {dateJp(q.requested_delivery)}</span>}
                  {q.promised_delivery && <span className="text-xs rounded px-1.5 py-0.5 bg-blue-50 text-blue-700">回答納期 {dateJp(q.promised_delivery)}</span>}
                  <button type="button" className={`text-[11px] rounded border px-1.5 py-0.5 ${q.delivery_kind === "confirmed" ? "bg-green-50 text-green-700 border-green-200" : "bg-amber-50 text-amber-800 border-amber-200"}`} title="クリックで概算／確定を切替" onClick={() => setKind(q.id, q.delivery_kind === "confirmed" ? "estimate" : "confirmed")}>{DELIVERY_KIND_LABEL[q.delivery_kind]}</button>
                  <Button size="sm" className="ml-auto" onClick={() => showNotice(q.id, q.quote_no)}>得意先への納期連絡文</Button>
                </div>
                <ul className="mt-2 space-y-1.5">
                  {waiting_items.map((it) => (
                    <li key={it.id} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="flex-1 min-w-[12rem]">{it.description} × {it.qty}{it.unit}<span className="text-xs text-muted">　{it.supplier?.name ?? "仕入れ先未設定"}</span></span>
                      <input type="date" className={`${inputCls} w-44`} onChange={(e) => record(q.id, it.id, e.target.value)} disabled={busy === it.id} />
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {notice && (
        <Modal title={`納期のご連絡 — ${notice.quote_no}`} onClose={() => setNotice(null)}>
          {notice.late && <p className="text-sm text-danger mb-2">希望納期に間に合わない見込みです。分納・代替の提案文を含めています。</p>}
          <div className="flex items-center justify-between mb-1"><div className="font-medium text-sm">{notice.subject}</div><CopyButton text={`件名: ${notice.subject}\n\n${notice.body}`} label="件名＋本文をコピー" /></div>
          <pre className="whitespace-pre-wrap bg-bg rounded-md p-3 text-sm font-sans leading-relaxed">{notice.body}</pre>
        </Modal>
      )}
    </>
  );
}
