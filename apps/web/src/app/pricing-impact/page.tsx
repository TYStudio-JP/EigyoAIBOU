import Link from "next/link";
import { priceImpact } from "@eigyo/core";
import { db } from "@/lib/db";
import { Card, Empty, PageTitle, inputCls } from "@/components/ui";
import { pct, yen } from "@/lib/format";
export const dynamic = "force-dynamic";

export default async function PricingImpactPage({ searchParams }: { searchParams: Promise<{ pct?: string; supplier?: string; category?: string }> }) {
  const sp = await searchParams;
  const pctV = Number(sp.pct ?? "") || 0;
  const sim = pctV ? { pct: pctV, supplier_id: sp.supplier ? Number(sp.supplier) : null, category: sp.category || null } : null;
  const r = priceImpact(db(), sim);
  const totalGap = r.rows.reduce((s, x) => s + x.gap_amount, 0);
  return (
    <>
      <PageTitle title="価格改定の影響" sub={`粗利下限 ${r.floor_pct}%`} />
      <Card title="値上げをシミュレーション" className="mb-4">
        <form className="flex flex-wrap items-end gap-3 text-sm" action="/pricing-impact">
          <div><label className="block text-xs text-muted mb-1">仕入れ値の上昇率（%）</label><input name="pct" type="number" step="1" defaultValue={sp.pct ?? ""} placeholder="例 10" className={`${inputCls} w-28 num`} /></div>
          <div><label className="block text-xs text-muted mb-1">仕入れ先（任意）</label><select name="supplier" defaultValue={sp.supplier ?? ""} className={inputCls}><option value="">すべて</option>{r.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div><label className="block text-xs text-muted mb-1">カテゴリ（任意）</label><select name="category" defaultValue={sp.category ?? ""} className={inputCls}><option value="">すべて</option>{r.categories.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
          <button className="rounded-md bg-brand text-brand-ink px-4 py-2 font-medium">計算</button>
          {sim && <Link href="/pricing-impact" className="text-xs text-brand hover:underline">シミュレーション解除</Link>}
        </form>
      </Card>
      <Card title={`${sim ? `＋${pctV}% のとき、` : ""}対応が必要な得意先×商品：${r.rows.filter((x) => x.level !== "ok").length} 件　取り戻すべき額 ${yen(totalGap)}`}>
        {r.rows.length === 0 ? <Empty>現在の仕入れ値では粗利下限を割る商品はありません</Empty> : (
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[52rem]">
            <thead className="text-xs text-muted"><tr><th className="text-left font-normal py-1">得意先</th><th className="text-left font-normal">商品</th><th className="text-right font-normal">直近単価</th><th className="text-right font-normal">仕入れ（前→後）</th><th className="text-right font-normal">粗利（前→後）</th><th className="text-right font-normal">必要売価</th><th className="text-right font-normal">累計数量</th><th className="text-right font-normal">取り戻す額</th></tr></thead>
            <tbody>
              {r.rows.filter((x) => sim || x.level !== "ok").slice(0, 200).map((x, i) => (
                <tr key={i} className={`border-t border-line ${x.level === "danger" ? "bg-red-50/50" : x.level === "warn" ? "bg-amber-50/40" : ""}`}>
                  <td className="py-1.5"><Link href={`/customers/${x.customer.id}/brief`} className="hover:underline">{x.customer.short_name}</Link></td>
                  <td>{x.product.name}<div className="text-xs text-muted num">{x.product.part_number}</div></td>
                  <td className="text-right num">{yen(x.last_price)}<div className="text-xs text-muted">{x.last_date.slice(0, 10)}</div></td>
                  <td className="text-right num">{yen(x.cost_before)} → {yen(x.cost_now)}</td>
                  <td className={`text-right num ${x.level === "danger" ? "text-danger font-bold" : x.level === "warn" ? "text-warn" : ""}`}>{pct(x.margin_before, 0)} → {pct(x.margin_now, 0)}</td>
                  <td className="text-right num font-medium">{yen(x.needed_price)}</td>
                  <td className="text-right num text-muted">{x.annual_qty}</td>
                  <td className="text-right num">{yen(x.gap_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Card>
    </>
  );
}
