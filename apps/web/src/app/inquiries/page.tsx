import Link from "next/link";
import { listInquiries, INQUIRY_KIND_LABEL, INQUIRY_CHANNEL_LABEL } from "@eigyo/core";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/user";
import { Card, Empty, LinkButton, PageTitle } from "@/components/ui";
import { dateJp } from "@/lib/format";

export const dynamic = "force-dynamic";

/** 問い合わせ回答：未回答を先頭に。 */
export default async function InquiriesPage({ searchParams }: { searchParams: Promise<{ all?: string; done?: string }> }) {
  const sp = await searchParams;
  const d = db();
  const me = await currentUser(d);
  const list = listInquiries(d, { userId: sp.all === "1" ? null : me?.id ?? null, status: sp.done === "1" ? ["answered", "closed"] : ["open"], limit: 200 });
  return (
    <>
      <PageTitle title={sp.done === "1" ? "回答済みの問い合わせ" : `問い合わせ未回答 ${list.length}`} action={<div className="flex gap-2"><Link href={sp.done === "1" ? "/inquiries" : "/inquiries?done=1"} className="text-xs text-brand hover:underline self-center">{sp.done === "1" ? "未回答へ" : "回答済みを見る"}</Link><LinkButton href="/inquiries/new" variant="primary">＋ 問い合わせを記録</LinkButton></div>} />
      <Card>
        {list.length === 0 ? <Empty>{sp.done === "1" ? "回答済みはありません" : "未回答の問い合わせはありません"}</Empty> : (
          <ul className="divide-y divide-line">
            {list.map((i) => (
              <li key={i.id}>
                <Link href={`/inquiries/${i.id}`} className="flex items-start gap-3 py-2.5">
                  <span className="shrink-0 mt-0.5 rounded border border-line bg-bg px-1.5 py-0.5 text-[11px] font-semibold">{INQUIRY_KIND_LABEL[i.kind]}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{i.customer?.short_name ?? "得意先未設定"}<span className="text-muted font-normal">　{i.question.replace(/\s+/g, " ").slice(0, 80)}</span></div>
                    <div className="text-xs text-muted">{INQUIRY_CHANNEL_LABEL[i.channel]}・{dateJp(i.created_at)}{i.due ? `・期限 ${dateJp(i.due)}` : ""}{i.answered_at ? `・回答 ${dateJp(i.answered_at)}` : ""}</div>
                  </div>
                  <span className="text-[11px] text-brand font-semibold shrink-0">{i.status === "open" ? "回答を作る →" : "見る →"}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
