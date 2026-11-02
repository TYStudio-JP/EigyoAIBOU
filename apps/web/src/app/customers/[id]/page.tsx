import Link from "next/link";
import { notFound } from "next/navigation";
import { crossSellCandidates, getCustomer, getProduct, hasApiKey, listQuotes, purchasedProducts } from "@eigyo/core";
import { db } from "@/lib/db";
import { Card, PageTitle, StatusBadge } from "@/components/ui";
import { CrossSellPanel } from "@/components/crosssell-panel";
import { dateJp, yen } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = db();
  const c = getCustomer(d, Number(id));
  if (!c) notFound();
  const bought = purchasedProducts(d, c.id).map((b) => ({ ...b, product: getProduct(d, b.product_id)! })).sort((a, b) => b.last_date.localeCompare(a.last_date));
  const quotes = listQuotes(d, { customerId: c.id, limit: 30 });
  const cross = crossSellCandidates(d, c.id);
  return (
    <>
      <PageTitle title={c.name} sub={`${c.code}・${c.industry}・${c.prefecture}・担当 ${c.contact_name ?? "-"}（${c.contact_email ?? "-"}）・${c.payment_terms}`} />
      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <Card title="得意先メモ" className="lg:col-span-1"><p className="text-sm">{c.notes || "—"}</p></Card>
        <Card title="購入中の商品（受注実績）" className="lg:col-span-2">
          {bought.length === 0 ? <p className="text-sm text-muted">受注実績なし</p> : (
            <table className="w-full text-sm">
              <thead className="text-xs text-muted"><tr><th className="text-left font-normal py-1">商品</th><th className="text-left font-normal">カテゴリ</th><th className="text-right font-normal">累計数量</th><th className="text-right font-normal">直近単価</th><th className="text-right font-normal">直近</th></tr></thead>
              <tbody>{bought.map((b) => <tr key={b.product_id} className="border-t border-line"><td className="py-1">{b.product.name}</td><td className="text-muted">{b.category}</td><td className="text-right num">{b.total_qty}{b.product.unit}</td><td className="text-right num">{yen(b.last_price)}</td><td className="text-right num text-muted">{dateJp(b.last_date)}</td></tr>)}</tbody>
            </table>
          )}
        </Card>
      </div>
      <div className="mb-4"><CrossSellPanel result={cross} aiEnabled={hasApiKey()} /></div>
      <Card title="見積り履歴">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted"><tr><th className="text-left font-normal py-1">見積番号</th><th className="text-left font-normal">件名</th><th className="text-right font-normal">金額</th><th className="text-left font-normal pl-4">状態</th><th className="text-left font-normal">失注理由</th><th className="text-right font-normal">更新</th></tr></thead>
          <tbody>{quotes.map((q) => <tr key={q.id} className="border-t border-line"><td className="py-1"><Link href={`/quotes/${q.id}`} className="text-brand hover:underline num">{q.quote_no}</Link></td><td className="text-muted">{q.subject}</td><td className="text-right num">{yen(q.total)}</td><td className="pl-4"><StatusBadge status={q.status} /></td><td className="text-xs text-muted">{q.lost_detail ?? ""}</td><td className="text-right num text-muted">{dateJp(q.updated_at)}</td></tr>)}</tbody>
        </table>
      </Card>
    </>
  );
}
