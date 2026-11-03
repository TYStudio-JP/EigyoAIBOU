import Link from "next/link";
import { listDeals, listUsers, DEAL_STATUS_LABEL, type DealStatus } from "@eigyo/core";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/user";
import { Card, Empty, PageTitle } from "@/components/ui";
import { DealStatusBadge } from "@/components/deal-badge";
import { dateJp, yen } from "@/lib/format";

export const dynamic = "force-dynamic";
const ALL: DealStatus[] = ["inquiry", "quoting", "submitted", "tracking", "won", "lost", "dormant"];

export default async function DealsPage({ searchParams }: { searchParams: Promise<{ status?: string; scope?: string }> }) {
  const sp = await searchParams;
  const d = db();
  const me = await currentUser(d);
  const scope = sp.scope ?? "mine";
  const status = (sp.status?.split(",").filter((s) => ALL.includes(s as DealStatus)) as DealStatus[]) ?? [];
  let deals = listDeals(d, { status: status.length ? status : undefined, openOnly: !status.length, limit: 500 });
  if (scope === "mine" && me) deals = deals.filter((x) => x.customer.owner_user_id === me.id);
  const t = new Date().toISOString().slice(0, 10);
  const users = listUsers(d, { includeInactive: true });
  return (
    <>
      <PageTitle title="案件" />
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Link href={`/deals?scope=mine${status.length ? "&status=" + status.join(",") : ""}`} className={`text-xs rounded-full px-3 py-1 border ${scope === "mine" ? "bg-brand text-brand-ink border-brand" : "border-line bg-surface"}`}>自分の担当</Link>
        <Link href={`/deals?scope=all${status.length ? "&status=" + status.join(",") : ""}`} className={`text-xs rounded-full px-3 py-1 border ${scope === "all" ? "bg-brand text-brand-ink border-brand" : "border-line bg-surface"}`}>全員</Link>
        <span className="text-muted text-xs">｜</span>
        <Link href={`/deals?scope=${scope}`} className={`text-xs rounded-full px-3 py-1 border ${!status.length ? "bg-ink text-white border-ink" : "border-line bg-surface"}`}>進行中</Link>
        {ALL.map((s) => <Link key={s} href={`/deals?scope=${scope}&status=${s}`} className={`text-xs rounded-full px-3 py-1 border ${status.includes(s) ? "bg-ink text-white border-ink" : "border-line bg-surface"}`}>{DEAL_STATUS_LABEL[s]}</Link>)}
      </div>
      <Card>
        {deals.length === 0 ? <Empty>該当する案件がありません</Empty> : (
          <ul className="divide-y divide-line">
            {deals.map((x) => {
              const overdue = x.next_action_due && x.next_action_due < t && x.status !== "won" && x.status !== "lost";
              const owner = users.find((u) => u.id === x.customer.owner_user_id);
              return (
                <li key={x.id}>
                  <Link href={`/deals/${x.id}`} className="flex gap-3 py-3 active:bg-bg">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{x.customer.short_name}</span><span className="text-sm">{x.title}</span><DealStatusBadge status={x.status} /></div>
                      <div className="text-xs text-muted mt-0.5 truncate">{x.contact ? `${x.contact.name}　` : ""}{x.end_customer ? `納入先 ${x.end_customer.name}　` : ""}見積り {x.quote_count}・電話 {x.call_count}・最終 {dateJp(x.last_activity_at)}{scope === "all" && owner ? `・担当 ${owner.name}` : ""}</div>
                      {x.next_action && <div className={`text-xs mt-1 ${overdue ? "text-danger font-semibold" : "text-ink"}`}>→ {x.next_action}{x.next_action_due ? `（${dateJp(x.next_action_due)}${overdue ? " 期限切れ" : ""}）` : ""}</div>}
                    </div>
                    <div className="text-right num shrink-0 font-medium">{yen(x.amount)}</div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
