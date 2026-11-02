import type { Db } from "../db/connection";
import { CONTACT_STATUS_LABEL, CUSTOMER_KIND_LABEL, DEAL_STATUS_LABEL, LOST_REASON_LABEL } from "./types";
import { addDealEvent, addOwnerRecord, contactWorkload, getCustomer, getUser, listContacts, listDeals, listEndCustomers, listQuotes, nowStamp, purchasedProducts, getProduct, setCustomerOwner, updateDeal } from "./repo";
import type { CustomerOwnerRecord } from "./types";
import { contactEndCustomerMap } from "./deals";

/** 引継ぎ書の元になる事実（AI 無しでもそのまま読める Markdown）。 */
export function handoverFacts(db: Db, customerId: number): string {
  const c = getCustomer(db, customerId);
  if (!c) throw new Error("customer not found");
  const lines: string[] = [];
  lines.push(`# ${c.name} 引継ぎ資料`, "", `- 得意先コード: ${c.code}／種別: ${CUSTOMER_KIND_LABEL[c.kind]}／業種: ${c.industry}／所在地: ${c.prefecture}`, `- 支払条件: ${c.payment_terms}／代表電話: ${c.tel ?? "-"}`, `- メモ: ${c.notes || "-"}`, "");
  lines.push("## 担当者");
  const wl = contactWorkload(db, customerId, 180);
  for (const w of wl) {
    const k = w.contact;
    lines.push(`- ${k.name}（${k.department} ${k.title}）[${CONTACT_STATUS_LABEL[k.status]}] TEL ${k.tel ?? "-"} / 携帯 ${k.mobile ?? "-"} / ${k.email ?? "-"}。直近180日: 電話 ${w.calls} 件・見積り ${w.quotes} 件・案件 ${w.deals} 件（進行中 ${w.open_deals}）。最終接点 ${w.last_contact_at?.slice(0, 10) ?? "-"}。${k.notes ? "メモ: " + k.notes : ""}`);
  }
  if (!wl.length) lines.push("- （担当者未登録）");
  lines.push("");
  const ends = listEndCustomers(db, customerId);
  if (c.kind === "dealer" || ends.length) {
    lines.push("## 納入先（得意先の得意先）と担当の対応関係");
    for (const e of ends) lines.push(`- ${e.name}（${e.industry || "業種不明"}）${e.notes ? "：" + e.notes : ""}`);
    for (const m of contactEndCustomerMap(db, customerId)) lines.push(`- ${m.contact_name} → ${m.end_customers.join("・") || "納入先の記録なし"}（案件 ${m.deals} 件）`);
    lines.push("");
  }
  lines.push("## 進行中の案件");
  const open = listDeals(db, { customerId, openOnly: true, limit: 100 });
  for (const d of open) lines.push(`- 「${d.title}」[${DEAL_STATUS_LABEL[d.status]}] 担当 ${d.contact?.name ?? "-"}${d.end_customer ? " / 納入先 " + d.end_customer.name : ""} 金額 ${Math.round(d.amount).toLocaleString()}円 最終 ${d.last_activity_at.slice(0, 10)}\n  - 状況: ${d.summary.replace(/\n/g, " ")}\n  - 次の一手: ${d.next_action || "-"}（期限 ${d.next_action_due ?? "-"}）`);
  if (!open.length) lines.push("- なし");
  lines.push("", "## 直近の受注・失注（1 年）");
  const closed = listQuotes(db, { customerId, status: ["won", "lost"], limit: 15 });
  for (const q of closed) lines.push(`- ${q.closed_at?.slice(0, 10) ?? ""} ${q.quote_no} ${q.subject} ${Math.round(q.total).toLocaleString()}円 → ${q.status === "won" ? "受注" : `失注（${LOST_REASON_LABEL[q.lost_reason ?? "other"]}: ${q.lost_detail ?? ""}）`}`);
  if (!closed.length) lines.push("- なし");
  lines.push("", "## 継続購入している商品");
  for (const p of purchasedProducts(db, customerId).slice(0, 15)) { const pr = getProduct(db, p.product_id)!; lines.push(`- ${pr.name}（${pr.part_number}）直近単価 ${Math.round(p.last_price).toLocaleString()}円 累計 ${p.total_qty}${pr.unit} 最終 ${p.last_date.slice(0, 10)}`); }
  lines.push("", `（担当者マスタ: 在籍 ${listContacts(db, customerId).length} 名）`);
  return lines.join("\n");
}

/**
 * 得意先の担当を別ユーザーへ引き継ぐ。
 * - 得意先の担当ユーザーを更新し、担当履歴に記録（引継ぎ書本文も保存）
 * - 進行中の各案件の経緯と詳細要約に「ここまでは前回の担当者〇〇」を明記
 * - 前任者の画面には「過去の担当先」として残る（customer_owners の from_user_id から引く）
 */
export function handoverCustomer(db: Db, customerId: number, toUserId: number, opts: { note?: string; handover_doc?: string; at?: string } = {}): CustomerOwnerRecord {
  const c = getCustomer(db, customerId);
  if (!c) throw new Error("customer not found");
  const to = getUser(db, toUserId);
  if (!to) throw new Error("user not found");
  const from = c.owner_user_id ? getUser(db, c.owner_user_id) : null;
  const at = opts.at ?? nowStamp();
  const doc = opts.handover_doc ?? handoverFacts(db, customerId);
  const rec = addOwnerRecord(db, { customer_id: customerId, from_user_id: from?.id ?? null, to_user_id: to.id, handed_at: at, note: opts.note ?? "", handover_doc: doc });
  setCustomerOwner(db, customerId, to.id);
  const marker = `━━ ここまでは前回の担当者 ${from?.name ?? "（未設定）"}（${at.slice(0, 10)} に ${to.name} へ引継ぎ）━━`;
  for (const d of listDeals(db, { customerId, openOnly: true, limit: 500 })) {
    addDealEvent(db, d.id, "handover", marker, { type: "handover", id: rec.id }, at);
    updateDeal(db, d.id, { summary_detail: `${d.summary_detail}\n${marker}`.trim() });
  }
  return rec;
}
