/**
 * 返事待ち（外出先のホーム）：得意先から来てまだ返していないもの、自分が約束してまだ果たしていないものを一本のリストにする。
 * 事実は各ドメインの関数から決定的に集め、急ぎの順に並べる。
 */
import type { Db } from "../db/connection";
import { daysBetween, getCustomer, listCalls, listInquiries, listQuotes, today } from "./repo";
import { INQUIRY_KIND_LABEL } from "./types";
import { followupQueue } from "./followup";
import { deliveryWaitingList } from "./delivery";
import { pendingFormalList } from "./provisional";
import { INBOX_KIND_LABEL, type InboxKind } from "./types";

export interface InboxItem {
  kind: InboxKind;
  label: string;
  /** 得意先名（短縮）。 */
  customer: string;
  customer_id: number | null;
  /** 件名・要点。 */
  title: string;
  /** あと何をすれば返せるか（一行）。 */
  todo: string;
  /** 次アクションのボタン文言と遷移先。 */
  action: string;
  url: string;
  /** 起点の日時（経過時間の表示用）。 */
  since: string;
  days: number;
  amount: number | null;
  /** 小さいほど急ぎ。 */
  priority: number;
}

export function replyQueue(db: Db, opts: { userId?: number | null; asOf?: string; limit?: number } = {}): InboxItem[] {
  const asOf = opts.asOf ?? today();
  const mine = (customerId: number | null) => !opts.userId || !customerId || getCustomer(db, customerId)?.owner_user_id === opts.userId;
  const items: InboxItem[] = [];

  for (const c of listCalls(db, { status: ["open", "processed"], limit: 100 })) {
    if (!mine(c.customer_id)) continue;
    const name = c.customer?.short_name ?? (c.tel ? `未登録 ${c.tel}` : "得意先未設定");
    if (c.status === "open") {
      items.push({ kind: "call_open", label: INBOX_KIND_LABEL.call_open, customer: name, customer_id: c.customer_id, title: `${c.started_at.slice(5, 16)} の通話`, todo: "30 秒話して記録すると、依頼の価格照合・納期・確認メールまで揃います", action: "話して記録", url: `/calls/${c.id}`, since: c.started_at, days: daysBetween(c.started_at, asOf), amount: null, priority: 10 });
    } else {
      const needs = c.minutes?.requests.filter((r) => r.result?.status === "needs_human") ?? [];
      if (needs.length) items.push({ kind: "call_needs_human", label: INBOX_KIND_LABEL.call_needs_human, customer: name, customer_id: c.customer_id, title: needs.map((r) => r.result!.headline).join(" / "), todo: "担当判断が要る依頼。決めたら確認メールを送るだけ", action: "確認する", url: `/calls/${c.id}`, since: c.updated_at, days: daysBetween(c.updated_at, asOf), amount: null, priority: 20 });
    }
  }

  for (const iq of listInquiries(db, { status: ["open"], limit: 100 })) {
    if (!mine(iq.customer_id)) continue;
    items.push({ kind: "inquiry_open", label: INBOX_KIND_LABEL.inquiry_open, customer: iq.customer?.short_name ?? "得意先未設定", customer_id: iq.customer_id, title: `${INQUIRY_KIND_LABEL[iq.kind]}：${iq.question.replace(/\s+/g, " ").slice(0, 60)}`, todo: "社内記録とウェブで回答文を作り、コピーして返すだけ", action: "回答を作る", url: `/inquiries/${iq.id}`, since: iq.created_at, days: daysBetween(iq.created_at, asOf), amount: null, priority: iq.due && iq.due <= asOf ? 12 : 15 });
  }

  for (const q of pendingFormalList(db)) {
    if (!mine(q.customer_id)) continue;
    items.push({ kind: "provisional", label: INBOX_KIND_LABEL.provisional, customer: q.customer_name, customer_id: q.customer_id, title: `${q.subject}（${q.quote_no}）`, todo: "口頭・SMS で単価は伝え済み。正式見積書を自分宛てに送って転送するだけ", action: "正式見積書", url: `/quotes/${q.id}`, since: q.provisional_at!, days: daysBetween(q.provisional_at!, asOf), amount: q.total, priority: 25 });
  }

  for (const q of listQuotes(db, { status: ["draft"], limit: 100 })) {
    if (!mine(q.customer_id)) continue;
    if (q.source_type === "manual" && q.item_count === 0) continue;
    items.push({ kind: "quote_draft", label: INBOX_KIND_LABEL.quote_draft, customer: q.customer_name, customer_id: q.customer_id, title: `${q.subject}（${q.item_count} 明細）`, todo: "単価を確認して、暫定で回答するか正式見積書を送る", action: "ポイント確認", url: `/quotes/${q.id}`, since: q.created_at, days: daysBetween(q.created_at, asOf), amount: q.total, priority: 30 });
  }

  for (const w of deliveryWaitingList(db)) {
    if (!mine(w.quote.customer_id)) continue;
    if (w.quote.status === "draft" && !w.overdue) continue;
    items.push({ kind: "delivery_waiting", label: INBOX_KIND_LABEL.delivery_waiting, customer: w.quote.customer.short_name, customer_id: w.quote.customer_id, title: `${w.quote.subject}：${w.waiting_items.map((it) => it.description).join("・")}`, todo: w.overdue ? "希望納期が 1 週間以内。仕入れ先に納期を催促" : "仕入れ先の納期回答を入れると回答納期が決まります", action: "納期を入れる", url: `/delivery`, since: w.quote.created_at, days: daysBetween(w.quote.created_at, asOf), amount: w.quote.total, priority: w.overdue ? 22 : 45 });
  }

  for (const f of followupQueue(db, asOf)) {
    if (f.urgency !== "overdue" && f.urgency !== "due") continue;
    if (!mine(f.quote.customer_id)) continue;
    items.push({ kind: "followup", label: INBOX_KIND_LABEL.followup, customer: f.quote.customer_name, customer_id: f.quote.customer_id, title: `${f.quote.subject}（${f.quote.quote_no}）`, todo: f.suggestion, action: "フォロー", url: `/quotes/${f.quote.id}`, since: f.quote.submitted_at ?? f.quote.created_at, days: f.days_since_last_touch, amount: f.quote.total, priority: f.urgency === "overdue" ? 40 : 50 });
  }

  return items
    .sort((a, b) => a.priority - b.priority || b.days - a.days || (b.amount ?? 0) - (a.amount ?? 0))
    .slice(0, opts.limit ?? 50);
}
