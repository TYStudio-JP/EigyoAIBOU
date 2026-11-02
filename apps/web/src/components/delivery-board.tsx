"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { DeliveryWaiting } from "@eigyo/core/shared";
import { Button, Card, Empty, inputCls } from "./ui";
import { Modal, CopyButton } from "./modal";
import { dateJp } from "@/lib/format";

export function DeliveryBoard({ items }: { items: DeliveryWaiting[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ subject: string; body: string; late: boolean; quote_no: string } | null>(null);
  const record = async (quoteId: number, itemId: number, date: string) => {
    if (!date) return;
    setBusy(itemId);
    await fetch(`/api/quotes/${quoteId}/delivery`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item_id: itemId, supplier_delivery: date }) });
    setBusy(null); router.refresh();
  };
  const showNotice = async (quoteId: number, quoteNo: string) => {
    const r = await fetch(`/api/quotes/${quoteId}/delivery`); const j = await r.json(); setNotice({ ...j, quote_no: quoteNo });
  };
  return (
    <>
      <Card>
        {items.length === 0 ? <Empty>納期回答待ちはありません</Empty> : (
          <ul className="divide-y divide-line">
            {items.map(({ quote: q, waiting_items, overdue }) => (
              <li key={q.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/quotes/${q.id}`} className="font-semibold hover:underline">{q.customer.short_name}</Link>
                  <span className="text-sm text-muted">{q.subject}</span>
                  <span className="text-xs text-muted num">{q.quote_no}</span>
                  {q.requested_delivery && <span className={`text-xs rounded px-1.5 py-0.5 ${overdue ? "bg-red-50 text-red-700" : "bg-gray-100 text-gray-700"}`}>希望納期 {dateJp(q.requested_delivery)}</span>}
                  <Button size="sm" className="ml-auto" onClick={() => showNotice(q.id, q.quote_no)}>得意先への納期連絡文</Button>
                </div>
                <ul className="mt-2 space-y-1.5">
                  {waiting_items.map((it) => (
                    <li key={it.id} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="flex-1 min-w-[12rem]">{it.description} × {it.qty}{it.unit}<span className="text-xs text-muted">　{it.supplier?.name ?? "仕入れ先未設定"}</span></span>
                      <input type="date" className={`${inputCls} w-44`} onChange={(e) => record(q.id, it.id, e.target.value)} disabled={busy === it.id} />
                      <span className="text-xs text-muted">回答納期を入れると記録</span>
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
