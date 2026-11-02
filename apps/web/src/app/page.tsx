import Link from "next/link";
import { dashboardStats, followupQueue, listCalls, listQuotes, lostReasonStats, hasApiKey, LOST_REASON_LABEL, type LostReason } from "@eigyo/core";
import { db } from "@/lib/db";
import { Card, Empty, LinkButton, PageTitle, Stat, StatusBadge } from "@/components/ui";
import { dateJp, pct, yen } from "@/lib/format";
import { UrgencyPill } from "@/components/urgency";

export const dynamic = "force-dynamic";

export default function Dashboard() {
  const d = db();
  const stats = dashboardStats(d);
  const queue = followupQueue(d).slice(0, 6);
  const recent = listQuotes(d, { limit: 8 });
  const lost = lostReasonStats(d);
  const ai = hasApiKey();
  const calls = listCalls(d, { limit: 50 }).filter((c) => c.status === "open" || (c.status === "processed" && c.minutes?.requests.some((r) => r.result?.status === "needs_human")));
  return (
    <>
      <PageTitle title="今日の営業AI棒" sub="商談・訪問・電話に時間を使えるよう、それ以外を片付けます。" action={<div className="hidden lg:flex gap-2"><LinkButton href="/calls/new">☎ 電話メモ</LinkButton><LinkButton href="/quotes/new" variant="primary">＋ 見積りを作る</LinkButton></div>} />
      {!ai && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          ANTHROPIC_API_KEY が未設定のため AI 機能（依頼文の読み取り・文面作成・レビュー）は簡易モードです。<code className="mx-1">.env</code> にキーを設定して再起動してください。
        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Stat label="要フォロー（提出済・追跡中）" value={stats.by_status.submitted + stats.by_status.tracking} sub={`提出済 ${stats.by_status.submitted} / 追跡中 ${stats.by_status.tracking}`} tone="warn" />
        <Stat label="未決着の見積り金額" value={yen(stats.open_amount)} sub="税抜合計" />
        <Stat label="直近30日の受注額" value={yen(stats.recent_won_amount)} tone="ok" />
        <Stat label="受注率（累計）" value={pct(stats.win_rate_pct, 0)} sub={`受注 ${stats.by_status.won} / 失注 ${stats.by_status.lost}`} />
      </div>
      <div className="grid lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-5" title="電話の宿題（メモ未入力・担当確認待ち）" action={<Link href="/calls" className="text-xs text-brand hover:underline">電話メモへ →</Link>}>
          {calls.length === 0 ? <Empty>電話の宿題はありません</Empty> : (
            <ul className="divide-y divide-line">
              {calls.slice(0, 5).map((c) => {
                const needs = c.minutes?.requests.filter((r) => r.result?.status === "needs_human") ?? [];
                return (
                  <li key={c.id} className="py-2.5 flex items-center gap-3">
                    <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[11px] font-semibold ${c.status === "open" ? "bg-amber-50 text-amber-800 border-amber-200" : "bg-blue-50 text-blue-700 border-blue-200"}`}>{c.status === "open" ? "メモ未入力" : `確認 ${needs.length}`}</span>
                    <div className="flex-1 min-w-0">
                      <Link href={`/calls/${c.id}`} className="font-medium hover:underline">{c.customer?.short_name ?? (c.tel ? `未登録 ${c.tel}` : "得意先未設定")}</Link>
                      <div className="text-xs text-muted truncate">{c.status === "open" ? `${c.started_at.slice(5, 16)} の通話。要点を話して記録してください` : needs.map((r) => r.result!.headline).join(" / ")}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card className="lg:col-span-3" title="そろそろ「あの見積り、どうなった？」" action={<Link href="/tracking" className="text-xs text-brand hover:underline">追跡ボードへ →</Link>}>
          {queue.length === 0 ? <Empty>フォローが必要な案件はありません</Empty> : (
            <ul className="divide-y divide-line">
              {queue.map((f) => (
                <li key={f.quote.id} className="py-2.5 flex items-center gap-3">
                  <UrgencyPill urgency={f.urgency} />
                  <div className="flex-1 min-w-0">
                    <Link href={`/quotes/${f.quote.id}`} className="font-medium hover:underline">{f.quote.customer_name}　<span className="text-muted font-normal">{f.quote.subject}</span></Link>
                    <div className="text-xs text-muted truncate">{f.suggestion}</div>
                  </div>
                  <div className="text-right text-sm num">{yen(f.quote.total)}<div className="text-xs text-muted">提出 {f.days_since_submit}日前</div></div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="lg:col-span-2" title="失注理由の傾向（次の提案に活かす）">
          {lost.length === 0 ? <Empty>失注データなし</Empty> : (
            <ul className="space-y-2">
              {lost.map((r) => {
                const max = lost[0].count;
                return (
                  <li key={r.reason} className="text-sm">
                    <div className="flex justify-between"><span>{LOST_REASON_LABEL[r.reason as LostReason] ?? r.reason}</span><span className="num text-muted">{r.count}件 / {yen(r.amount)}</span></div>
                    <div className="h-1.5 bg-bg rounded mt-1"><div className="h-1.5 bg-accent rounded" style={{ width: `${(r.count / max) * 100}%` }} /></div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card className="lg:col-span-5" title="最近の見積り" action={<Link href="/quotes" className="text-xs text-brand hover:underline">一覧へ →</Link>}>
          <ul className="lg:hidden divide-y divide-line">
            {recent.slice(0, 5).map((q) => (
              <li key={q.id}><Link href={`/quotes/${q.id}`} className="flex items-center gap-3 py-2.5"><div className="flex-1 min-w-0"><div className="font-medium truncate">{q.customer_name} <span className="text-muted font-normal text-xs">{q.subject}</span></div><div className="text-xs text-muted num">{q.quote_no}・{dateJp(q.updated_at)}</div></div><div className="text-right"><div className="num text-sm">{yen(q.total)}</div><StatusBadge status={q.status} /></div></Link></li>
            ))}
          </ul>
          <table className="hidden lg:table w-full text-sm">
            <thead className="text-xs text-muted"><tr><th className="text-left font-normal py-1">見積番号</th><th className="text-left font-normal">得意先</th><th className="text-left font-normal">件名</th><th className="text-right font-normal">金額</th><th className="text-left font-normal pl-4">状態</th><th className="text-right font-normal">更新</th></tr></thead>
            <tbody>
              {recent.map((q) => (
                <tr key={q.id} className="border-t border-line">
                  <td className="py-1.5"><Link href={`/quotes/${q.id}`} className="text-brand hover:underline num">{q.quote_no}</Link></td>
                  <td>{q.customer_name}</td>
                  <td className="text-muted truncate max-w-[22rem]">{q.subject}</td>
                  <td className="text-right num">{yen(q.total)}</td>
                  <td className="pl-4"><StatusBadge status={q.status} /></td>
                  <td className="text-right text-muted num">{dateJp(q.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
