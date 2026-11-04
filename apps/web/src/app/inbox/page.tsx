import Link from "next/link";
import { replyQueue } from "@eigyo/core";
import { currentUser } from "@/lib/user";
import { db } from "@/lib/db";
import { Card, PageTitle } from "@/components/ui";
import { InboxList } from "@/components/inbox-list";

export const dynamic = "force-dynamic";

/** 返事待ち：得意先から来てまだ返していないもの・自分が約束してまだ果たしていないもの。急ぎ順。 */
export default async function InboxPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const { all } = await searchParams;
  const d = db();
  const me = await currentUser(d);
  const items = replyQueue(d, { userId: all === "1" ? null : me?.id ?? null, limit: 100 });
  return (
    <>
      <PageTitle title={`返事待ち（${items.length}）`} sub={me && all !== "1" ? `${me.name} の担当分` : "全員分"} action={<Link href={all === "1" ? "/inbox" : "/inbox?all=1"} className="text-xs text-brand hover:underline">{all === "1" ? "自分の担当分だけ" : "全員分を見る"}</Link>} />
      <Card><InboxList items={items} /></Card>
    </>
  );
}
