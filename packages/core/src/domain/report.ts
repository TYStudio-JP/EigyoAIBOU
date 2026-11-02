import type { Db } from "../db/connection";
import { DEAL_STATUS_LABEL, STATUS_LABEL } from "./types";
import { getQuote, getUser, listCalls, listCustomers, listDeals, listQuotes, nowStamp, today } from "./repo";
import { all_ } from "./report-sql";

/** 日報の素材：その日の電話・見積り・フォロー・案件の動き（担当ユーザーの得意先に限定）。 */
export interface ReportFacts {
  date: string;
  user_name: string;
  calls: { customer: string; contact: string | null; summary: string; needs: string[]; url: string }[];
  quotes_created: { quote_no: string; customer: string; subject: string; total: number }[];
  quotes_submitted: { quote_no: string; customer: string; subject: string; total: number }[];
  quotes_won: { quote_no: string; customer: string; subject: string; total: number }[];
  quotes_lost: { quote_no: string; customer: string; subject: string; total: number; reason: string }[];
  followups: { quote_no: string; customer: string; body: string }[];
  deals_moved: { customer: string; title: string; status: string; next_action: string; due: string | null }[];
  tomorrow: { customer: string; title: string; next_action: string; due: string | null }[];
}
export function reportFacts(db: Db, date: string = today(), userId: number | null = null): ReportFacts {
  const user = userId ? getUser(db, userId) : null;
  const mine = new Set(listCustomers(db).filter((c) => !userId || c.owner_user_id === userId).map((c) => c.id));
  const d0 = `${date} 00:00:00`, d1 = `${date} 23:59:59`;
  const calls = listCalls(db, { limit: 500 }).filter((c) => c.started_at >= d0 && c.started_at <= d1 && (!c.customer_id || mine.has(c.customer_id)));
  const quotes = listQuotes(db, { limit: 2000 }).filter((q) => mine.has(q.customer_id));
  const created = quotes.filter((q) => q.created_at >= d0 && q.created_at <= d1);
  const submitted = quotes.filter((q) => q.submitted_at && q.submitted_at >= d0 && q.submitted_at <= d1);
  const closed = quotes.filter((q) => q.closed_at && q.closed_at >= d0 && q.closed_at <= d1);
  const followups = all_(db, "SELECT a.body, q.quote_no, c.short_name AS customer FROM activities a JOIN quotes q ON q.id=a.quote_id JOIN customers c ON c.id=q.customer_id WHERE a.kind='followup' AND a.created_at BETWEEN ? AND ?", d0, d1).filter((f) => true);
  const deals = listDeals(db, { limit: 1000 }).filter((x) => mine.has(x.customer_id));
  // 「動いた案件」は人の行動（電話・見積り・フォロー・メモ・メール・引継ぎ）があったものだけ。状態の再計算や要約更新は含めない
  const movedIds = new Set<number>(all_<{ deal_id: number }>(db, "SELECT DISTINCT deal_id FROM deal_events WHERE kind IN ('call','quote','followup','note','mail','handover','created') AND created_at BETWEEN ? AND ?", d0, d1).map((r) => r.deal_id));
  for (const c of calls) if (c.deal_id) movedIds.add(c.deal_id);
  for (const q of [...created, ...submitted, ...closed]) { const dq = getQuote(db, q.id); if (dq?.deal_id) movedIds.add(dq.deal_id); }
  const moved = deals.filter((x) => movedIds.has(x.id)).slice(0, 12);
  const nextDay = new Date(date + "T00:00:00"); nextDay.setDate(nextDay.getDate() + 1);
  const tomorrowIso = nextDay.toISOString().slice(0, 10);
  const tomorrow = deals.filter((x) => x.status !== "won" && x.status !== "lost" && x.next_action_due && x.next_action_due <= tomorrowIso).slice(0, 8);
  const lostLabel: Record<string, string> = { price: "価格", delivery: "納期", competitor: "他社採用", cancelled: "案件消滅", other: "その他" };
  return {
    date, user_name: user?.name ?? "",
    calls: calls.map((c) => ({ customer: c.customer?.short_name ?? (c.tel ?? "不明"), contact: c.contact?.name ?? null, summary: c.minutes?.summary ?? (c.memo ? c.memo.slice(0, 120) : "メモ未入力"), needs: c.minutes?.requests.filter((r) => r.result?.status === "needs_human").map((r) => r.result!.headline) ?? [], url: `/calls/${c.id}` })),
    quotes_created: created.map((q) => ({ quote_no: q.quote_no, customer: q.customer_name, subject: q.subject, total: Math.round(q.total) })),
    quotes_submitted: submitted.map((q) => ({ quote_no: q.quote_no, customer: q.customer_name, subject: q.subject, total: Math.round(q.total) })),
    quotes_won: closed.filter((q) => q.status === "won").map((q) => ({ quote_no: q.quote_no, customer: q.customer_name, subject: q.subject, total: Math.round(q.total) })),
    quotes_lost: closed.filter((q) => q.status === "lost").map((q) => ({ quote_no: q.quote_no, customer: q.customer_name, subject: q.subject, total: Math.round(q.total), reason: `${lostLabel[q.lost_reason ?? "other"]}${q.lost_detail ? "：" + q.lost_detail : ""}` })),
    followups: followups as { quote_no: string; customer: string; body: string }[],
    deals_moved: moved.map((x) => ({ customer: x.customer.short_name, title: x.title, status: DEAL_STATUS_LABEL[x.status], next_action: x.next_action, due: x.next_action_due })),
    tomorrow: tomorrow.map((x) => ({ customer: x.customer.short_name, title: x.title, next_action: x.next_action, due: x.next_action_due })),
  };
}

/** 決定的な日報下書き（AI 無しでそのまま提出できる形）。 */
export function reportDraft(f: ReportFacts): string {
  const yen = (n: number) => `${n.toLocaleString()}円`;
  const L: string[] = [`# 営業日報 ${f.date.replace(/-/g, "/")}${f.user_name ? `　${f.user_name}` : ""}`, ""];
  L.push("## 本日の活動");
  if (f.calls.length) { L.push("### 電話"); for (const c of f.calls) { L.push(`- ${c.customer}${c.contact ? `（${c.contact}）` : ""}：${c.summary.split("\n").map((s) => s.replace(/^・/, "")).filter(Boolean).slice(0, 2).join(" / ")}`); for (const n of c.needs) L.push(`  - 要対応: ${n}`); } }
  if (f.quotes_created.length) { L.push("### 見積り作成"); for (const q of f.quotes_created) L.push(`- ${q.customer} ${q.subject}（${q.quote_no}）${yen(q.total)}`); }
  if (f.quotes_submitted.length) { L.push("### 見積り提出"); for (const q of f.quotes_submitted) L.push(`- ${q.customer} ${q.subject}（${q.quote_no}）${yen(q.total)}`); }
  if (f.followups.length) { L.push("### フォロー"); for (const x of f.followups) L.push(`- ${x.customer}（${x.quote_no}）：${x.body}`); }
  if (!f.calls.length && !f.quotes_created.length && !f.quotes_submitted.length && !f.followups.length) L.push("- 記録された活動はありません");
  L.push("", "## 成果");
  if (f.quotes_won.length) for (const q of f.quotes_won) L.push(`- 受注：${q.customer} ${q.subject}（${q.quote_no}）${yen(q.total)}`);
  if (f.quotes_lost.length) for (const q of f.quotes_lost) L.push(`- 失注：${q.customer} ${q.subject}（${q.quote_no}）${yen(q.total)}　理由: ${q.reason}`);
  if (!f.quotes_won.length && !f.quotes_lost.length) L.push("- 受注・失注なし");
  if (f.deals_moved.length) { L.push("", "## 動いた案件"); for (const d of f.deals_moved) L.push(`- ${d.customer}「${d.title}」[${d.status}]${d.next_action ? ` → ${d.next_action}${d.due ? `（${d.due}）` : ""}` : ""}`); }
  L.push("", "## 明日の予定");
  if (f.tomorrow.length) for (const t of f.tomorrow) L.push(`- ${t.customer}「${t.title}」：${t.next_action}${t.due ? `（期限 ${t.due}）` : ""}`); else L.push("- 期限の迫る案件なし");
  L.push("", "## 所感・雑談メモ", "- （ここに一言）");
  return L.join("\n");
}

export function saveReport(db: Db, date: string, userId: number | null, body: string): void {
  db.prepare("INSERT INTO daily_reports(date,user_id,body,created_at,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(date,user_id) DO UPDATE SET body=excluded.body, updated_at=excluded.updated_at").run(date, userId ?? 0, body, nowStamp(), nowStamp());
}
export function getReport(db: Db, date: string, userId: number | null): string | null {
  const r = db.prepare("SELECT body FROM daily_reports WHERE date=? AND user_id=?").get(date, userId ?? 0) as { body: string } | undefined;
  return r?.body ?? null;
}
export { STATUS_LABEL as _statusLabelRef };
