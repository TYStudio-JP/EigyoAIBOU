import { currentSupplierPrices, hasApiKey, listProducts, listSuppliers, ROUTE_LABEL } from "@eigyo/core";
import { SupplierRules } from "@/components/supplier-rules";
import { WebResearch } from "@/components/web-research";
import { ProductResearchButton } from "@/components/product-research-button";
import { db } from "@/lib/db";
import { Card, PageTitle } from "@/components/ui";
import { yen } from "@/lib/format";

export const dynamic = "force-dynamic";

export default function ProductsPage() {
  const d = db();
  const products = listProducts(d);
  const byCat = new Map<string, typeof products>();
  for (const p of products) byCat.set(p.category, [...(byCat.get(p.category) ?? []), p]);
  return (
    <>
      <div className="lg:hidden mb-3 rounded-md border border-line bg-surface px-3 py-2 text-xs text-muted">登録・変更はパソコンから行えます。</div>
      <PageTitle title="商品・仕入れ先" />
      <Card className="mb-4" title="ウェブで調べる"><WebResearch aiEnabled={hasApiKey()} compact /></Card>
      <Card className="mb-4 hidden lg:block" title="仕入れ先の標準掛率"><SupplierRules suppliers={listSuppliers(d)} /></Card>
      <div className="space-y-4">
        {[...byCat.entries()].map(([cat, ps]) => (
          <Card key={cat} title={cat}>
            <table className="w-full text-sm">
              <thead className="text-xs text-muted"><tr><th className="text-left font-normal py-1">コード</th><th className="text-left font-normal">品番</th><th className="text-left font-normal">商品名</th><th className="text-left font-normal">メーカー</th><th className="text-right font-normal">定価</th><th className="text-left font-normal pl-4">仕入れルート（原価／最小ロット／納期）</th></tr></thead>
              <tbody>
                {ps.map((p) => {
                  const routes = currentSupplierPrices(d, p.id);
                  return (
                    <tr key={p.id} className="border-t border-line align-top">
                      <td className="py-1.5 num text-muted">{p.code}</td>
                      <td className="num">{p.part_number}</td>
                      <td>{p.name}<div className="text-xs text-muted">{p.spec}</div><ProductResearchButton product={{ maker: p.maker, part_number: p.part_number, name: p.name, spec: p.spec }} aiEnabled={hasApiKey()} /></td>
                      <td className="text-muted">{p.maker}</td>
                      <td className="text-right num">{yen(p.list_price)}</td>
                      <td className="pl-4">
                        {routes.map((r, i) => (
                          <div key={r.id} className={`text-xs ${i === 0 ? "font-bold" : "text-muted"}`}>
                            {r.supplier_name}（{ROUTE_LABEL[r.route_type]}）{yen(r.cost)} ／ {r.min_lot}{p.unit}〜 ／ {r.lead_time_days ?? "-"}日
                          </div>
                        ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        ))}
      </div>
    </>
  );
}
