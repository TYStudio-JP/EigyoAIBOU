import Link from "next/link";
import { listCalls, CALL_STATUS_LABEL } from "@eigyo/core";
import { db } from "@/lib/db";
import { Card, Empty, LinkButton, PageTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function CallsPage() {
  const calls = listCalls(db(), { limit: 100 });
  const open = calls.filter((c) => c.status === "open");
  const rest = calls.filter((c) => c.status !== "open");
  const Row = ({ c }: { c: (typeof calls)[number] }) => {
    const needs = c.minutes?.requests.filter((r) => r.result?.status === "needs_human").length ?? 0;
    return (
      <li>
        <Link href={`/calls/${c.id}`} className="flex items-center gap-3 py-3 active:bg-bg">
          <div className="w-10 h-10 rounded-full bg-brand/10 text-brand flex items-center justify-center shrink-0">☎</div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold truncate">{c.customer?.short_name ?? (c.tel ? `未登録 ${c.tel}` : "得意先未設定")}<span className="text-muted font-normal text-xs ml-2">{{ in: "着信", out: "発信", unknown: "" }[c.direction]}</span></div>
            <div className="text-xs text-muted truncate">{c.started_at.slice(5, 16)}　{c.minutes ? c.minutes.summary.split("\n")[0].replace(/^・/, "") : c.memo ? c.memo.slice(0, 40) : "メモ未入力"}</div>
          </div>
          <div className="text-right shrink-0">
            <div className={`text-xs font-semibold ${c.process_state ? "text-brand" : c.status === "open" ? "text-warn" : c.status === "processed" ? "text-info" : "text-ok"}`}>{c.process_state ? "作成中" : CALL_STATUS_LABEL[c.status]}</div>
            {needs > 0 && <div className="text-[11px] text-warn">担当確認 {needs}</div>}
          </div>
        </Link>
      </li>
    );
  };
  return (
    <>
      <PageTitle title="電話メモ" action={<LinkButton href="/calls/new" variant="primary">☎ 新しい電話メモ</LinkButton>} />
      <div className="space-y-4">
        <Card title={`メモ未入力（${open.length}）`}>{open.length === 0 ? <Empty>なし</Empty> : <ul className="divide-y divide-line">{open.map((c) => <Row key={c.id} c={c} />)}</ul>}</Card>
        <Card title="処理済み">{rest.length === 0 ? <Empty>なし</Empty> : <ul className="divide-y divide-line">{rest.map((c) => <Row key={c.id} c={c} />)}</ul>}</Card>
      </div>
    </>
  );
}
