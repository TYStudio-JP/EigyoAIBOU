import Link from "next/link";
import { listQuotes, type QuoteStatus, STATUS_LABEL } from "@eigyo/core";
import { db } from "@/lib/db";
import { Card, Empty, LinkButton, PageTitle, StatusBadge } from "@/components/ui";
import { dateJp, pct, yen } from "@/lib/format";

export const dynamic = "force-dynamic";
const ALL: QuoteStatus[] = ["draft", "submitted", "tracking", "won", "lost"];

export default async function QuotesPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const sp = await searchParams;
  const status = (sp.status?.split(",").filter((s) => ALL.includes(s as QuoteStatus)) as QuoteStatus[]) ?? [];
  const rows = listQuotes(db(), { status: status.length ? status : undefined, q: sp.q });
  return (
    <>
      <PageTitle title="見積り一覧" action={<LinkButton href="/quotes/new" variant="primary">＋ 見積りを作る</LinkButton>} />
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Link href="/quotes" className={`text-xs rounded-full px-3 py-1 border ${!status.length ? "bg-brand text-brand-ink border-brand" : "border-line bg-surface"}`}>すべて</Link>
        {ALL.map((s) => (
          <Link key={s} href={`/quotes?status=${s}`} className={`text-xs rounded-full px-3 py-1 border ${status.includes(s) ? "bg-brand text-brand-ink border-brand" : "border-line bg-surface"}`}>{STATUS_LABEL[s]}</Link>
        ))}
        <form className="ml-auto" action="/quotes">
          {status.length > 0 && <input type="hidden" name="status" value={status.join(",")} />}
          <input name="q" defaultValue={sp.q ?? ""} placeholder="番号・件名・得意先で検索" className="rounded-md border border-line px-3 py-1.5 text-sm w-64" />
        </form>
      </div>
      <Card>
        {rows.length === 0 ? <Empty>該当する見積りがありません</Empty> : (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted"><tr><th className="text-left font-normal py-1">見積番号</th><th className="text-left font-normal">得意先</th><th className="text-left font-normal">件名</th><th className="text-right font-normal">金額</th><th className="text-right font-normal">粗利</th><th className="text-left font-normal pl-4">状態</th><th className="text-right font-normal">提出</th><th className="text-right font-normal">更新</th></tr></thead>
            <tbody>
              {rows.map((q) => (
                <tr key={q.id} className="border-t border-line hover:bg-bg">
                  <td className="py-2"><Link href={`/quotes/${q.id}`} className="text-brand hover:underline num">{q.quote_no}</Link></td>
                  <td>{q.customer_name}</td>
                  <td className="text-muted truncate max-w-[20rem]">{q.subject}</td>
                  <td className="text-right num">{yen(q.total)}</td>
                  <td className={`text-right num ${q.total && (q.total - q.total_cost) / q.total < 0.15 ? "text-danger" : ""}`}>{q.total ? pct(((q.total - q.total_cost) / q.total) * 100) : "-"}</td>
                  <td className="pl-4"><StatusBadge status={q.status} /></td>
                  <td className="text-right text-muted num">{dateJp(q.submitted_at)}</td>
                  <td className="text-right text-muted num">{dateJp(q.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
