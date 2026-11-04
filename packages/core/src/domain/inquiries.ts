/**
 * 問い合わせ回答：得意先からの質問（仕様・納期・在庫・同等品・価格）を記録し、
 * 社内記録（商品マスタ・仕入れ先の原価と納期・過去の販売単価）を集めて回答文の材料にする。
 * 数字は社内記録からだけ。AI は文面を整えるだけ（ai/inquiry-answer.ts）。送るのは人。
 */
import type { Db } from "../db/connection";
import { addDays, createInquiry, currentSupplierPrices, findProducts, getCustomer, getInquiry, listQuotes, listSuppliers, priceHistory, today, updateInquiry } from "./repo";
import { ROUTE_LABEL, type Customer, type InquiryChannel, type InquiryKind, type InquiryWithRefs, type Product, type SupplierPrice } from "./types";
import { matchCustomerByText } from "./visits";

/** 質問文から種類を推定する（決定的）。 */
export function classifyInquiry(text: string): InquiryKind {
  const t = text.replace(/\s/g, "");
  if (/同等|代替|代わり|互換|後継|廃番|廃盤|似た/.test(t)) return "equivalent";
  if (/納期|いつ届|いつ頃|最短|何日|間に合/.test(t)) return "delivery";
  if (/在庫|あります|ありますか|入手|手に入|取り寄せ|取寄/.test(t)) return "stock";
  if (/いくら|価格|単価|値段|見積|金額|安く/.test(t)) return "price";
  if (/仕様|規格|サイズ|寸法|材質|耐|容量|適合|使える|対応|スペック|JIS|mm|φ/.test(t)) return "spec";
  return "other";
}

export interface InquiryProductFact {
  product: Product;
  routes: (SupplierPrice & { route_label: string })[];
  best_cost: number | null;
  shortest_lead_days: number | null;
  earliest_delivery: string | null;
  last_price_to_customer: { unit_price: number; date: string; quote_no: string } | null;
  other_customers: { min: number; max: number; count: number } | null;
  same_category: { code: string; name: string; part_number: number | string; spec: string }[];
}
export interface InquiryFacts {
  inquiry: InquiryWithRefs;
  customer: Customer | null;
  products: InquiryProductFact[];
  recent_quotes: { quote_no: string; subject: string; status: string; date: string }[];
  /** 社内記録だけから組み立てた回答の下書き（AI 無しでも使える）。 */
  deterministic_answer: string;
  open_points: string[];
}

const yen = (n: number) => `${Math.round(n).toLocaleString("ja-JP")}円`;
const jp = (iso: string) => iso.slice(0, 10).replace(/-/g, "/");

/** 質問文から商品の手がかり（品番らしき語・商品名の語）を拾う。 */
export function productQueriesFromText(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/[A-Za-z]{1,6}[-‐－]?\d{1,6}(?:[-‐－][A-Za-z0-9]{1,6})*/g)) out.add(m[0].replace(/[‐－]/g, "-"));
  for (const m of text.matchAll(/φ?\d{1,4}(?:\.\d+)?\s?(?:mm|cm|L|ml|kg|g|V|A|W)/gi)) out.add(m[0]);
  const words = text.replace(/[、。,.\n\r（）()「」]/g, " ").split(/\s+/).filter((w) => w.length >= 2 && w.length <= 12 && !/^(です|ます|について|ですが|でしょうか|お願い|教えて|ください|いくら|納期|在庫|同等|代替)/.test(w));
  for (const w of words.slice(0, 12)) out.add(w);
  return [...out];
}

export function inquiryFacts(db: Db, inquiryId: number): InquiryFacts {
  const inquiry = getInquiry(db, inquiryId);
  if (!inquiry) throw new Error("問い合わせが見つかりません");
  const customer = inquiry.customer_id ? getCustomer(db, inquiry.customer_id) : null;
  const t = today();
  // 商品の特定：品番 → 語 の順で探し、重複を除いて最大 3 件
  const found: Product[] = [];
  for (const q of productQueriesFromText(inquiry.question)) {
    for (const p of findProducts(db, q, 3)) if (!found.some((x) => x.id === p.id)) found.push(p);
    if (found.length >= 3) break;
  }
  const supplierLead = new Map(listSuppliers(db).map((s) => [s.id, s.lead_time_days]));
  const products: InquiryProductFact[] = found.slice(0, 3).map((p) => {
    const routes = currentSupplierPrices(db, p.id).map((r) => ({ ...r, route_label: ROUTE_LABEL[r.route_type] }));
    const leads = routes.map((r) => r.lead_time_days ?? supplierLead.get(r.supplier_id) ?? null).filter((n): n is number => n !== null);
    const shortest = leads.length ? Math.min(...leads) : null;
    const hist = priceHistory(db, p.id, { limit: 30 });
    const mine = customer ? hist.filter((h) => h.customer_id === customer.id) : [];
    const last = mine.find((h) => h.status === "won") ?? mine[0] ?? null;
    const others = hist.filter((h) => !customer || h.customer_id !== customer.id).filter((h) => h.status !== "lost");
    const sameCat = findProducts(db, p.category, 6).filter((x) => x.id !== p.id && x.category === p.category).slice(0, 4);
    return {
      product: p, routes, best_cost: routes[0]?.cost ?? null, shortest_lead_days: shortest, earliest_delivery: shortest !== null ? addDays(t, shortest + 1) : null,
      last_price_to_customer: last ? { unit_price: last.unit_price, date: last.date, quote_no: last.quote_no } : null,
      other_customers: others.length ? { min: Math.min(...others.map((o) => o.unit_price)), max: Math.max(...others.map((o) => o.unit_price)), count: others.length } : null,
      same_category: sameCat.map((x) => ({ code: x.code, name: x.name, part_number: x.part_number, spec: x.spec })),
    };
  });
  const recent_quotes = customer ? listQuotes(db, { customerId: customer.id, limit: 5 }).map((q) => ({ quote_no: q.quote_no, subject: q.subject, status: q.status, date: (q.submitted_at ?? q.created_at).slice(0, 10) })) : [];
  const open_points: string[] = [];
  if (!customer) open_points.push("どの得意先からの問い合わせか未設定");
  if (products.length === 0) open_points.push("商品を特定できません（品番か商品名を補ってください）");
  for (const f of products) {
    if (f.routes.length === 0) open_points.push(`${f.product.name}：仕入れ先の登録がありません`);
    if (inquiry.kind === "stock") open_points.push(`${f.product.name}：在庫数は仕入れ先に確認（在庫情報は持っていません）`);
  }
  return { inquiry, customer, products, recent_quotes, deterministic_answer: composeDeterministicAnswer(inquiry, customer, products), open_points };
}

/** 社内記録だけで書ける範囲の回答文（短文）。数字は事実のみ、分からないことは「確認します」と書く。 */
export function composeDeterministicAnswer(inquiry: InquiryWithRefs, customer: Customer | null, products: InquiryProductFact[]): string {
  const head = customer?.contact_name ? `${customer.contact_name} 様` : customer ? `${customer.name} ご担当者様` : "ご担当者様";
  const lines: string[] = [head, "お問い合わせありがとうございます。"];
  if (products.length === 0) lines.push("恐れ入りますが、品番または商品名をお知らせいただけますでしょうか。確認のうえ折り返しご回答します。");
  for (const f of products) {
    const p = f.product;
    lines.push(`■ ${p.name}（${p.maker} ${p.part_number}）${p.spec ? `　${p.spec}` : ""}`);
    switch (inquiry.kind) {
      case "delivery": lines.push(f.earliest_delivery ? `　最短 ${jp(f.earliest_delivery)} 頃の納品が可能です（ご注文後、仕入れ先の在庫状況により前後します）。` : "　納期は仕入れ先に確認のうえ、本日中にご連絡します。"); break;
      case "price": lines.push(f.last_price_to_customer ? `　前回（${jp(f.last_price_to_customer.date)}）と同じ ${yen(f.last_price_to_customer.unit_price)}／${p.unit} でご案内できます。` : "　お見積りを作成してお送りします（数量をお知らせください）。"); break;
      case "stock": lines.push(f.shortest_lead_days !== null ? `　仕入れ先の標準納期は ${f.shortest_lead_days} 日です。在庫の有無を確認して折り返します。` : "　在庫の有無を仕入れ先に確認して折り返します。"); break;
      case "equivalent": lines.push(f.same_category.length ? `　同じ区分の取扱品：${f.same_category.slice(0, 3).map((x) => `${x.name}（${x.part_number}）`).join("、")}。仕様をご確認のうえ、適合するものをご案内します。` : "　同等品の候補を調べて折り返します。"); break;
      default: lines.push(p.spec ? `　仕様：${p.spec}` : "　詳細仕様はメーカー資料を確認のうえご連絡します。");
    }
  }
  lines.push("ご不明点があればお申し付けください。");
  return lines.join("\n");
}

/** 回答を記録して完了にする。 */
export function answerInquiry(db: Db, id: number, answer: string, channel: InquiryChannel, opts: { close?: boolean } = {}): InquiryWithRefs {
  return updateInquiry(db, id, { answer, answer_channel: channel, status: opts.close === false ? "open" : "answered", answered_at: new Date().toISOString().slice(0, 19).replace("T", " ") });
}

/** テキストから問い合わせを登録する（得意先は文面から推定、種類も推定）。 */
export function logInquiryFromText(db: Db, text: string, opts: { user_id?: number | null; customer_id?: number | null; channel?: InquiryChannel; source?: string; due?: string | null } = {}): InquiryWithRefs {
  const customer = opts.customer_id ? getCustomer(db, opts.customer_id) : matchCustomerByText(db, text);
  const kind = classifyInquiry(text);
  return createInquiry(db, { user_id: opts.user_id ?? null, customer_id: customer?.id ?? null, channel: opts.channel ?? "mail", kind, question: text.trim(), source: opts.source ?? "manual", due: opts.due ?? null });
}
