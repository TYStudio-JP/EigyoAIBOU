/**
 * 目標と実績：月の売上・粗利目標に対して、今月の受注実績、あといくら、どの見積りを受注すれば達成するか。
 * 事実は決定的に集計する（受注額 = 受注見積りの合計、粗利 = 売価 − 仕入れ）。
 */
import type { Db } from "../db/connection";
import { getCustomer, getUser, listQuotes, today, type QuoteSummary } from "./repo";
import { followupQueue } from "./followup";

export interface TargetCandidate {
  quote_id: number;
  quote_no: string;
  customer: string;
  subject: string;
  status: QuoteSummary["status"];
  total: number;
  margin: number;
  urgency: "overdue" | "due" | "soon" | "fresh" | null;
  cumulative_sales: number;
  cumulative_margin: number;
  /** この見積りまで受注すると売上目標に届く。 */
  reaches_sales: boolean;
  reaches_margin: boolean;
}
export interface TargetProgress {
  month: string;               // YYYY-MM
  user_id: number | null;
  user_name: string | null;
  target_sales: number | null;
  target_margin: number | null;
  won_sales: number;
  won_margin: number;
  won_count: number;
  gap_sales: number | null;    // 残り（マイナスなら達成超過）
  gap_margin: number | null;
  pct_sales: number | null;    // 達成率 %
  pct_margin: number | null;
  open_sales: number;          // 未決着の見積り合計（提出済・追跡中）
  open_margin: number;
  candidates: TargetCandidate[];
  /** 金額の大きい順に受注したとき、売上目標に届くまでに必要な件数（届かなければ null）。 */
  needed_count: number | null;
  days_left: number;           // 月末まで
}

const monthOf = (iso: string) => iso.slice(0, 7);
function daysLeftInMonth(asOf: string): number {
  const [y, m, d] = asOf.slice(0, 10).split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return Math.max(0, last - d);
}

export function targetProgress(db: Db, opts: { userId?: number | null; month?: string; asOf?: string } = {}): TargetProgress {
  const asOf = opts.asOf ?? today();
  const month = opts.month ?? monthOf(asOf);
  const user = opts.userId ? getUser(db, opts.userId) : null;
  const mine = (customerId: number) => !opts.userId || getCustomer(db, customerId)?.owner_user_id === opts.userId;

  const won = listQuotes(db, { status: ["won"], limit: 2000 }).filter((q) => q.closed_at && monthOf(q.closed_at) === month && mine(q.customer_id));
  const won_sales = won.reduce((s, q) => s + q.total, 0);
  const won_margin = won.reduce((s, q) => s + (q.total - q.total_cost), 0);

  const target_sales = user?.target_sales ?? null;
  const target_margin = user?.target_margin ?? null;
  const gap_sales = target_sales != null ? target_sales - won_sales : null;
  const gap_margin = target_margin != null ? target_margin - won_margin : null;

  const urgencyByQuote = new Map(followupQueue(db, asOf).map((f) => [f.quote.id, f.urgency] as const));
  const open = listQuotes(db, { status: ["submitted", "tracking"], limit: 2000 }).filter((q) => mine(q.customer_id)).sort((a, b) => b.total - a.total);
  let cs = 0, cm = 0, needed: number | null = null;
  const candidates: TargetCandidate[] = open.map((q, i) => {
    cs += q.total; cm += q.total - q.total_cost;
    const reaches_sales = gap_sales != null && gap_sales > 0 && cs >= gap_sales;
    const reaches_margin = gap_margin != null && gap_margin > 0 && cm >= gap_margin;
    if (reaches_sales && needed === null) needed = i + 1;
    return { quote_id: q.id, quote_no: q.quote_no, customer: q.customer_name, subject: q.subject, status: q.status, total: q.total, margin: q.total - q.total_cost, urgency: urgencyByQuote.get(q.id) ?? null, cumulative_sales: cs, cumulative_margin: cm, reaches_sales, reaches_margin };
  });
  if (gap_sales != null && gap_sales <= 0) needed = 0;

  return {
    month, user_id: user?.id ?? null, user_name: user?.name ?? null, target_sales, target_margin,
    won_sales, won_margin, won_count: won.length, gap_sales, gap_margin,
    pct_sales: target_sales ? Math.round((won_sales / target_sales) * 1000) / 10 : null,
    pct_margin: target_margin ? Math.round((won_margin / target_margin) * 1000) / 10 : null,
    open_sales: cs, open_margin: cm, candidates, needed_count: needed, days_left: daysLeftInMonth(asOf),
  };
}
