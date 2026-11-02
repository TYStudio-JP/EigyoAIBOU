import Link from "next/link";
import { listCustomers, listQuotes, purchasedProducts } from "@eigyo/core";
import { db } from "@/lib/db";
import { Card, PageTitle } from "@/components/ui";
import { yen } from "@/lib/format";

export const dynamic = "force-dynamic";

export default function CustomersPage() {
  const d = db();
  const customers = listCustomers(d);
  return (
    <>
      <PageTitle title="得意先" sub="得意先を開くと、同業他社の購買実績から「横展開できる商品」を提案します。" />
      <Card>
        <table className="w-full text-sm">
          <thead className="text-xs text-muted"><tr><th className="text-left font-normal py-1">コード</th><th className="text-left font-normal">得意先</th><th className="text-left font-normal">業種</th><th className="text-left font-normal">担当</th><th className="text-right font-normal">受注品目</th><th className="text-right font-normal">未決着</th><th className="text-left font-normal pl-4">メモ</th></tr></thead>
          <tbody>
            {customers.map((c) => {
              const bought = purchasedProducts(d, c.id).length;
              const open = listQuotes(d, { customerId: c.id, status: ["submitted", "tracking"] });
              return (
                <tr key={c.id} className="border-t border-line hover:bg-bg">
                  <td className="py-2 num text-muted">{c.code}</td>
                  <td><Link href={`/customers/${c.id}`} className="text-brand hover:underline font-medium">{c.name}</Link><div className="text-xs text-muted">{c.prefecture}</div></td>
                  <td>{c.industry}</td>
                  <td className="text-muted">{c.contact_name}</td>
                  <td className="text-right num">{bought}</td>
                  <td className="text-right num">{open.length ? `${open.length}件 / ${yen(open.reduce((s, q) => s + q.total, 0))}` : "-"}</td>
                  <td className="pl-4 text-xs text-muted max-w-[20rem] truncate">{c.notes}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}
