/**
 * メーカー・仕入れ先からの回答（単価・納期・有効期限・最小ロット）を明細に入れ、得意先の値付けルールで売単価を出す。
 * 外出先で「メーカー回答が届き次第、いつもの掛率で即答」を 1 画面で終わらせる。
 */
import type { Db } from "../db/connection";
import { addActivity, addSupplierPrice, getCustomer, getQuote, getSupplier, nowStamp, today, updateQuoteItem } from "./repo";
import { recordSupplierDelivery } from "./delivery";
import { resolvePricingRule, rulePrice, type PricingRule } from "./pricing-rule";
import type { QuoteWithItems } from "./types";

export interface SupplierQuoteInput { price?: number | null; delivery?: string | null; valid_until?: string | null; min_lot?: number | null; note?: string | null; apply_rule?: boolean }
export interface SupplierQuoteResult { quote: QuoteWithItems; item: QuoteWithItems["items"][number]; rule: PricingRule | null; rule_price: number | null; applied_unit_price: number | null }

export function recordSupplierQuote(db: Db, quoteId: number, itemId: number, input: SupplierQuoteInput): SupplierQuoteResult {
  const q0 = getQuote(db, quoteId);
  if (!q0) throw new Error("見積りが見つかりません");
  const it0 = q0.items.find((x) => x.id === itemId);
  if (!it0) throw new Error("明細が見つかりません");
  const price = input.price != null && input.price > 0 ? input.price : null;
  const patch: Parameters<typeof updateQuoteItem>[2] = { supplier_quote_at: nowStamp() };
  if (price) { patch.supplier_quote_price = price; patch.cost = price; }
  if (input.valid_until !== undefined) patch.supplier_quote_valid_until = input.valid_until || null;
  if (input.min_lot !== undefined) patch.supplier_quote_min_lot = input.min_lot ?? null;
  if (input.note !== undefined) patch.supplier_quote_note = input.note ?? null;

  // いつもの掛率／粗利で売単価
  const customer = getCustomer(db, q0.customer_id);
  const supplier = it0.supplier_id ? getSupplier(db, it0.supplier_id) : null;
  const rule = resolvePricingRule(customer, supplier);
  const basis = price ?? it0.cost;
  const rp = rule && basis > 0 ? rulePrice(basis, rule) : null;
  let applied: number | null = null;
  if (input.apply_rule && rp) { patch.unit_price = rp; applied = rp; }
  updateQuoteItem(db, itemId, patch);

  // 仕入れ価格の履歴にも残す（価格改定の影響・次回の提案に効く）
  if (price && it0.product_id && it0.supplier_id) addSupplierPrice(db, { product_id: it0.product_id, supplier_id: it0.supplier_id, cost: price, min_lot: input.min_lot ?? 1, lead_time_days: null, valid_from: today() });
  if (input.delivery !== undefined && input.delivery) recordSupplierDelivery(db, quoteId, itemId, input.delivery, "メーカー回答");

  const parts = [price ? `仕入れ ${price.toLocaleString()}円` : null, input.delivery ? `納期 ${input.delivery}` : null, input.valid_until ? `有効 ${input.valid_until}` : null, input.min_lot ? `最小 ${input.min_lot}` : null, applied ? `→ 売単価 ${applied.toLocaleString()}円（${rule!.label}）` : null].filter(Boolean).join("・");
  addActivity(db, quoteId, "note", `メーカー回答：${it0.description}　${parts}${input.note ? `（${input.note}）` : ""}`);
  const quote = getQuote(db, quoteId)!;
  return { quote, item: quote.items.find((x) => x.id === itemId)!, rule, rule_price: rp, applied_unit_price: applied };
}

export interface SupplierReplyFields { unit_price: number | null; delivery: string | null; lead_time_days: number | null; valid_until: string | null; min_lot: number | null; note: string | null }
const toIso = (y: string, m: string, d: string) => `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
/** 回答メールから数字を拾う決定的な簡易抽出（AI が無いときの代替。AI 版は ai/supplier-reply.ts）。 */
export function extractSupplierReplyFallback(text: string, todayIso: string = today()): SupplierReplyFields {
  const t = text.replace(/\r/g, "");
  const price = t.match(/(?:単価|価格|@|￥|¥)\s*[:：]?\s*(?:￥|¥)?\s*([\d,]{2,})\s*(?:円|$|\s)/m) ?? t.match(/([\d,]{3,})\s*円/);
  const unit_price = price ? Number(price[1].replace(/,/g, "")) : null;
  const dates = [...t.matchAll(/(\d{4})[\/年.\-](\d{1,2})[\/月.\-](\d{1,2})/g)].map((m) => ({ iso: toIso(m[1], m[2], m[3]), idx: m.index ?? 0 }));
  const short = [...t.matchAll(/(?<!\d)(\d{1,2})[\/月](\d{1,2})(?:日)?(?!\d)/g)].map((m) => ({ iso: toIso(todayIso.slice(0, 4), m[1], m[2]), idx: m.index ?? 0 }));
  const all = [...dates, ...short].sort((a, b) => a.idx - b.idx);
  // キーワードは日付の直前にあることが多い（「納期は 11/12」「有効期限 12/31」）。直後は「出荷予定」程度に限る
  const before = (idx: number, re: RegExp) => re.test(t.slice(Math.max(0, idx - 14), idx));
  const after = (idx: number, re: RegExp) => re.test(t.slice(idx, idx + 16).replace(/^[\d\/年月日.\-\s]+/, "").slice(0, 6));
  const valid = all.find((d) => before(d.idx, /有効|期限/)) ?? null;
  const deliv = all.find((d) => d !== valid && (before(d.idx, /納期|納品|出荷|入荷|着|発送/) || after(d.idx, /出荷|納品|入荷|着|発送/))) ?? all.find((d) => d !== valid) ?? null;
  const lead = t.match(/(\d{1,3})\s*(?:営業日|日)(?:程度|ほど|以内|後)?/);
  const lot = t.match(/(?:最小|最低|MOQ|ロット)[^\d]{0,6}(\d{1,6})/i);
  return { unit_price, delivery: deliv?.iso ?? null, lead_time_days: lead ? Number(lead[1]) : null, valid_until: valid?.iso ?? null, min_lot: lot ? Number(lot[1]) : null, note: null };
}
