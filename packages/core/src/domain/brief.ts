import type { Db } from "../db/connection";
import { CONTACT_STATUS_LABEL, DEAL_STATUS_LABEL, LOST_REASON_LABEL } from "./types";
import { getCustomer, getProduct, listCalls, listContacts, listDeals, listQuotes, ownerHistory, purchasedProducts, today } from "./repo";
import { crossSellCandidates } from "./crosssell";
import { followupQueue } from "./followup";

/** 訪問前の 1 ページ：この得意先について、訪問直前に知っておくべきことを事実だけで並べる。 */
export interface VisitBrief {
  customer: ReturnType<typeof getCustomer>;
  contacts: { id: number; name: string; department: string; title: string; status: string; notes: string; mobile: string | null }[];
  open_deals: { id: number; title: string; status: string; amount: number; next_action: string; due: string | null; overdue: boolean; summary: string; contact: string | null }[];
  recent_calls: { id: number; at: string; contact: string | null; headline: string; needs: string[] }[];
  waiting_quotes: { id: number; quote_no: string; subject: string; total: number; days: number; suggestion: string }[];
  recent_lost: { quote_no: string; subject: string; reason: string; at: string }[];
  staples: { name: string; last_price: number; last_date: string }[];
  cross_sell: { code: string; name: string; reason: string; reference_price: number }[];
  handover_notes: string[];
  talking_points: string[];  // 決定的に作る話題（AI があれば上書き）
}
export function visitBrief(db: Db, customerId: number): VisitBrief {
  const c = getCustomer(db, customerId);
  if (!c) throw new Error("customer not found");
  const t = today();
  const deals = listDeals(db, { customerId, openOnly: true, limit: 20 });
  const fq = followupQueue(db).filter((f) => f.quote.customer_id === customerId);
  const lost = listQuotes(db, { customerId, status: ["lost"], limit: 3 });
  const bought = purchasedProducts(db, customerId).sort((a, b) => b.last_date.localeCompare(a.last_date)).slice(0, 6);
  const cs = crossSellCandidates(db, customerId, 3);
  const calls = listCalls(db, { customerId, limit: 3 });
  const points: string[] = [];
  for (const d of deals.slice(0, 3)) if (d.next_action) points.push(`「${d.title}」：${d.next_action}`);
  for (const f of fq.slice(0, 2)) points.push(`見積り ${f.quote.quote_no} の返事をもらう（提出から ${f.days_since_submit} 日）`);
  for (const l of lost.slice(0, 1)) points.push(`前回の失注（${LOST_REASON_LABEL[l.lost_reason ?? "other"]}）の背景を確認`);
  for (const x of cs.candidates.slice(0, 2)) points.push(`横展開：${x.product.name}（同業で実績あり）`);
  return {
    customer: c,
    contacts: listContacts(db, customerId, { includeInactive: true }).map((k) => ({ id: k.id, name: k.name, department: k.department, title: k.title, status: CONTACT_STATUS_LABEL[k.status], notes: k.notes, mobile: k.mobile ?? k.tel })),
    open_deals: deals.map((d) => ({ id: d.id, title: d.title, status: DEAL_STATUS_LABEL[d.status], amount: Math.round(d.amount), next_action: d.next_action, due: d.next_action_due, overdue: Boolean(d.next_action_due && d.next_action_due < t), summary: d.summary, contact: d.contact?.name ?? null })),
    recent_calls: calls.map((x) => ({ id: x.id, at: x.started_at.slice(0, 16), contact: x.contact?.name ?? null, headline: x.minutes?.summary.split("\n").map((s) => s.replace(/^・/, "")).filter(Boolean).slice(1, 3).join(" / ") || x.memo.slice(0, 80) || "メモ未入力", needs: x.minutes?.requests.filter((r) => r.result?.status === "needs_human").map((r) => r.result!.headline) ?? [] })),
    waiting_quotes: fq.map((f) => ({ id: f.quote.id, quote_no: f.quote.quote_no, subject: f.quote.subject, total: Math.round(f.quote.total), days: f.days_since_submit, suggestion: f.suggestion })),
    recent_lost: lost.map((l) => ({ quote_no: l.quote_no, subject: l.subject, reason: `${LOST_REASON_LABEL[l.lost_reason ?? "other"]}${l.lost_detail ? "：" + l.lost_detail : ""}`, at: l.closed_at?.slice(0, 10) ?? "" })),
    staples: bought.map((b) => ({ name: getProduct(db, b.product_id)!.name, last_price: Math.round(b.last_price), last_date: b.last_date.slice(0, 10) })),
    cross_sell: cs.candidates.map((x) => ({ code: x.product.code, name: x.product.name, reason: x.reason, reference_price: x.reference_price })),
    handover_notes: ownerHistory(db, customerId).map((h) => h.note).filter(Boolean),
    talking_points: points,
  };
}
