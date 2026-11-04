import { notFound } from "next/navigation";
import { getQuote, getSettings } from "@eigyo/core";
import { db } from "@/lib/db";
import { dateLong as dateJp, yen } from "@/lib/format";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

/** 印刷・PDF 保存用の見積書（ナビ無し）。スマホは共有→「PDF として保存」、PC は印刷ダイアログで PDF を選ぶ。 */
export default async function QuotePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = db();
  const q = getQuote(d, Number(id));
  if (!q) notFound();
  const s = getSettings(d);
  const tax = Math.round(q.total * s.tax_rate);
  return (
    <div className="max-w-[210mm] mx-auto bg-white text-black p-6 lg:p-10 text-[13px] leading-relaxed print:p-0">
      <div className="no-print mb-4 flex items-center justify-between gap-2 rounded-md border border-line bg-bg px-3 py-2 text-xs">
        <span>印刷 → 「PDF に保存」</span>
        <PrintButton />
      </div>
      <h1 className="text-center text-2xl font-bold tracking-[0.5em] mb-6">御 見 積 書</h1>
      <div className="flex justify-between gap-6 mb-4">
        <div>
          <div className="text-lg font-bold border-b-2 border-black pb-1 pr-8">{q.customer.name} 御中</div>
          {q.customer.contact_name && <div className="mt-1">{q.customer.contact_name} 様</div>}
          <table className="mt-4 num"><tbody>
            <tr><td className="pr-4 text-gray-600">件名</td><td>{q.subject}</td></tr>
            <tr><td className="pr-4 text-gray-600">納期</td><td>{q.promised_delivery ? dateJp(q.promised_delivery) : q.requested_delivery ? dateJp(q.requested_delivery) : "別途ご相談"}</td></tr>
            <tr><td className="pr-4 text-gray-600">支払条件</td><td>{q.customer.payment_terms}</td></tr>
            <tr><td className="pr-4 text-gray-600">有効期限</td><td>{dateJp(q.valid_until)}</td></tr>
          </tbody></table>
        </div>
        <div className="text-right">
          <table className="ml-auto num text-xs"><tbody>
            <tr><td className="pr-3 text-gray-600">見積番号</td><td>{q.quote_no}</td></tr>
            <tr><td className="pr-3 text-gray-600">見積日</td><td>{dateJp(q.submitted_at ?? q.created_at)}</td></tr>
          </tbody></table>
          <div className="mt-4 font-bold text-base">{s.company_name}</div>
          <div className="text-xs">{s.company_address}</div>
          <div className="text-xs">TEL {s.company_tel}</div>
          <div className="text-xs">担当: {s.sales_rep}</div>
        </div>
      </div>
      <div className="flex items-end gap-3 mb-4">
        <span className="font-bold">御見積金額（税込）</span>
        <span className="text-2xl font-bold num border-b-4 border-double border-black px-2">{yen(q.total + tax)}</span>
      </div>
      <table className="w-full border-collapse num">
        <thead><tr className="bg-gray-100">
          {["No.", "品名・仕様", "数量", "単位", "単価", "金額", "備考"].map((h) => <th key={h} className="border border-gray-400 px-2 py-1 font-semibold text-xs">{h}</th>)}
        </tr></thead>
        <tbody>
          {q.items.map((it) => (
            <tr key={it.id}>
              <td className="border border-gray-400 px-2 py-1 text-center">{it.line_no}</td>
              <td className="border border-gray-400 px-2 py-1 text-left">{it.description}{it.product?.spec ? <span className="text-gray-500 text-xs">　{it.product.spec}</span> : null}</td>
              <td className="border border-gray-400 px-2 py-1 text-right">{it.qty}</td>
              <td className="border border-gray-400 px-2 py-1 text-center">{it.unit}</td>
              <td className="border border-gray-400 px-2 py-1 text-right">{yen(it.unit_price)}</td>
              <td className="border border-gray-400 px-2 py-1 text-right">{yen(it.qty * it.unit_price)}</td>
              <td className="border border-gray-400 px-2 py-1 text-left text-xs">{it.remarks}</td>
            </tr>
          ))}
          {Array.from({ length: Math.max(0, 8 - q.items.length) }).map((_, i) => <tr key={`e${i}`}>{Array.from({ length: 7 }).map((__, j) => <td key={j} className="border border-gray-400 px-2 py-1">&nbsp;</td>)}</tr>)}
        </tbody>
      </table>
      <table className="ml-auto mt-2 num"><tbody>
        <tr><td className="pr-6 text-right text-gray-600">小計</td><td className="text-right w-32">{yen(q.total)}</td></tr>
        <tr><td className="pr-6 text-right text-gray-600">消費税（{Math.round(s.tax_rate * 100)}%）</td><td className="text-right">{yen(tax)}</td></tr>
        <tr className="font-bold"><td className="pr-6 text-right">合計</td><td className="text-right border-t border-black">{yen(q.total + tax)}</td></tr>
      </tbody></table>
      <div className="mt-6"><div className="text-gray-600 text-xs">備考</div><div className="border border-gray-400 min-h-16 p-2 whitespace-pre-wrap">{q.notes}</div></div>
    </div>
  );
}
