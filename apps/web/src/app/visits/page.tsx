import { listCustomers, listVisits, stampOf } from "@eigyo/core";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/user";
import { PageTitle } from "@/components/ui";
import { VisitsPanel } from "@/components/visits-panel";

export const dynamic = "force-dynamic";

/** 訪問予定（今日〜2 週間）。ホームの「次の訪問」への自動切替の元データ。 */
export default async function VisitsPage() {
  const d = db();
  const me = await currentUser(d);
  const now = new Date();
  const to = new Date(now); to.setDate(to.getDate() + 14);
  const visits = listVisits(d, { userId: me?.id ?? null, from: stampOf(now).slice(0, 10) + " 00:00", to: stampOf(to).slice(0, 10) + " 23:59" });
  return (
    <>
      <PageTitle title="訪問予定" sub={me ? `${me.name} の予定。訪問の 10 分前になるとホームが「次の訪問」に切り替わります（設定で変更可）。` : undefined} />
      <VisitsPanel visits={visits} customers={listCustomers(d).map((c) => ({ id: c.id, short_name: c.short_name, name: c.name }))} icsUrl={me?.calendar_ics_url ?? null} />
    </>
  );
}
