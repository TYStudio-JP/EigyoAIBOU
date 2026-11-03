import Link from "next/link";
import { listCustomers, listQuotes, listUsers, pastCustomersOfUser, purchasedProducts, CUSTOMER_KIND_LABEL } from "@eigyo/core";
import { currentUser } from "@/lib/user";
import { db } from "@/lib/db";
import { Card, PageTitle } from "@/components/ui";
import { yen } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const d = db();
  const { scope = "mine" } = await searchParams;
  const me = await currentUser(d);
  const users = listUsers(d, { includeInactive: true });
  const all = listCustomers(d);
  const past = me ? pastCustomersOfUser(d, me.id) : [];
  const customers = scope === "all" || !me ? all : scope === "past" ? past.map((p) => p.customer) : all.filter((c) => c.owner_user_id === me.id);
  const pastInfo = new Map(past.map((p) => [p.customer.id, p]));
  return (
    <>
      <PageTitle title="得意先" action={<Link href="/contacts/new" className="text-sm text-brand hover:underline">＋ 担当者を追加（名刺OK）</Link>} />
      <div className="flex flex-wrap gap-2 mb-4">
        {[["mine", `自分の担当（${me ? all.filter((c) => c.owner_user_id === me.id).length : 0}）`], ["past", `過去の担当先（${past.length}）`], ["all", `全て（${all.length}）`]].map(([k, label]) => (
          <Link key={k} href={`/customers?scope=${k}`} className={`text-xs rounded-full px-3 py-1 border ${scope === k ? "bg-brand text-brand-ink border-brand" : "border-line bg-surface"}`}>{label}</Link>
        ))}
      </div>
      <Card>
        <ul className="lg:hidden divide-y divide-line">
          {customers.map((c) => (
            <li key={c.id}><Link href={`/customers/${c.id}`} className="flex items-center gap-3 py-3 active:bg-bg"><div className="flex-1 min-w-0"><div className="font-semibold truncate">{c.name}{c.kind === "dealer" && <span className="ml-1 text-[10px] rounded bg-purple-50 text-purple-700 px-1">ディーラー</span>}</div><div className="text-xs text-muted">{c.industry}・{c.prefecture}{scope !== "mine" ? `・担当 ${users.find((u) => u.id === c.owner_user_id)?.name ?? "未設定"}` : ""}{pastInfo.get(c.id) ? `・${pastInfo.get(c.id)!.handed_at.slice(0, 10)} に ${pastInfo.get(c.id)!.to_user?.name ?? ""} へ引継ぎ` : ""}</div></div><span className="text-muted">›</span></Link></li>
          ))}
        </ul>
        <table className="hidden lg:table w-full text-sm">
          <thead className="text-xs text-muted"><tr><th className="text-left font-normal py-1">コード</th><th className="text-left font-normal">得意先</th><th className="text-left font-normal">種別・業種</th><th className="text-left font-normal">自社担当</th><th className="text-right font-normal">受注品目</th><th className="text-right font-normal">未決着</th><th className="text-left font-normal pl-4">メモ</th></tr></thead>
          <tbody>
            {customers.map((c) => {
              const bought = purchasedProducts(d, c.id).length;
              const open = listQuotes(d, { customerId: c.id, status: ["submitted", "tracking"] });
              return (
                <tr key={c.id} className="border-t border-line hover:bg-bg">
                  <td className="py-2 num text-muted">{c.code}</td>
                  <td><Link href={`/customers/${c.id}`} className="text-brand hover:underline font-medium">{c.name}</Link><div className="text-xs text-muted">{c.prefecture}</div></td>
                  <td><span className="text-xs text-muted">{CUSTOMER_KIND_LABEL[c.kind].split("（")[0]}</span><br />{c.industry}</td>
                  <td className="text-muted">{users.find((u) => u.id === c.owner_user_id)?.name ?? "未設定"}{pastInfo.get(c.id) ? <div className="text-[11px]">{pastInfo.get(c.id)!.handed_at.slice(0, 10)} 引継ぎ済</div> : null}</td>
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
