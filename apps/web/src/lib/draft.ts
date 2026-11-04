import "server-only";
import {
  checkPrice, currentSupplierPrices, findCustomer, findProducts, getSettings, listCustomers, proposePrice,
  type Customer, type Db, type ExtractedRequest, type PriceCheck, type PriceProposal, type Product, type SupplierPrice,
} from "@eigyo/core";

/** 画面と API の間でやり取りする見積り下書き（JSON 化可能）。 */
export interface DraftItem {
  raw_text: string;
  product_query: string;
  product_id: number | null;
  product: Pick<Product, "id" | "code" | "name" | "part_number" | "unit" | "list_price" | "maker" | "spec"> | null;
  candidates: Pick<Product, "id" | "code" | "name" | "part_number" | "unit">[];
  description: string;
  qty: number;
  unit: string;
  unit_price: number;
  cost: number;
  supplier_id: number | null;
  supplier_options: SupplierPrice[];
  proposal: ProposalSummary | null;
  checks: PriceCheck[];
  remarks: string;
  is_new_for_customer: boolean;
  note: string | null;
}
export interface ProposalSummary {
  proposed_price: number;
  proposal_basis: string;
  floor_price: number | null;
  target_price: number | null;
  best_cost: number | null;
  best_supplier_name: string | null;
  last_same_customer: PriceProposal["last_same_customer"];
  other_customers: { min: number; max: number; avg: number; count: number } | null;
  history: PriceProposal["history"];
  rule: PriceProposal["rule"];
  rule_price: number | null;
}
export interface QuoteDraft {
  customer_id: number | null;
  customer_candidates: Customer[];
  subject: string;
  requested_delivery: string | null;
  delivery_note: string | null;
  price_pressure: string | null;
  open_questions: string[];
  source_type: string;
  source_text: string;
  notes: string;
  items: DraftItem[];
  ai_used: boolean;
}

function summarize(p: PriceProposal): ProposalSummary {
  return {
    proposed_price: p.proposed_price, proposal_basis: p.proposal_basis, floor_price: p.floor_price, target_price: p.target_price,
    best_cost: p.best_cost, best_supplier_name: p.best_supplier_name, last_same_customer: p.last_same_customer,
    other_customers: p.other_customers ? { min: p.other_customers.min, max: p.other_customers.max, avg: p.other_customers.avg, count: p.other_customers.count } : null,
    history: p.history.slice(0, 8), rule: p.rule, rule_price: p.rule_price,
  };
}

/** 得意先の名寄せ：ヒント文字列から候補を返す。 */
export function matchCustomer(d: Db, hint: string | null | undefined): Customer[] {
  if (!hint) return [];
  const direct = findCustomer(d, hint);
  if (direct.length) return direct;
  // 「みどり食品の高橋です」のような文からトークンで探す
  const tokens = hint.replace(/株式会社|有限会社|様|御中|の|です|より/g, " ").split(/[\s、。]+/).filter((t) => t.length >= 2);
  const seen = new Map<number, Customer>();
  for (const t of tokens) for (const c of findCustomer(d, t)) seen.set(c.id, c);
  return [...seen.values()];
}

/** 抽出結果 → 商品マッチ・価格提案・チェック済みの下書き。 */
export function buildDraft(d: Db, ex: ExtractedRequest, opts: { source_type: string; source_text: string; ai_used: boolean; customer_id?: number | null }): QuoteDraft {
  const candidates = matchCustomer(d, ex.customer_hint ?? ex.contact_name);
  const customer_id = opts.customer_id ?? (candidates.length === 1 ? candidates[0].id : null);
  const items: DraftItem[] = ex.items.map((it) => {
    const found = [
      ...(it.part_number ? findProducts(d, it.part_number, 5) : []),
      ...findProducts(d, it.product_query, 5),
    ].filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i);
    const product = found[0] ?? null;
    const base: DraftItem = {
      raw_text: it.raw_text, product_query: it.product_query, product_id: product?.id ?? null,
      product: product ? pickProduct(product) : null, candidates: found.slice(0, 5).map(pickProductLite),
      description: product ? `${product.name}（${product.part_number}）` : it.product_query,
      qty: it.qty || 1, unit: it.unit ?? product?.unit ?? "個", unit_price: 0, cost: 0, supplier_id: null, supplier_options: [],
      proposal: null, checks: [], remarks: it.note ?? "", is_new_for_customer: it.is_new_for_customer, note: it.note,
    };
    return customer_id && product ? priceItem(d, customer_id, base) : base;
  });
  return {
    customer_id, customer_candidates: candidates.length ? candidates : listCustomers(d),
    subject: ex.subject, requested_delivery: ex.requested_delivery, delivery_note: ex.delivery_note, price_pressure: ex.price_pressure,
    open_questions: ex.open_questions, source_type: opts.source_type, source_text: opts.source_text, notes: "", items, ai_used: opts.ai_used,
  };
}

export function pickProduct(p: Product) {
  return { id: p.id, code: p.code, name: p.name, part_number: p.part_number, unit: p.unit, list_price: p.list_price, maker: p.maker, spec: p.spec };
}
export function pickProductLite(p: Product) {
  return { id: p.id, code: p.code, name: p.name, part_number: p.part_number, unit: p.unit };
}

/** 1 明細に価格提案とチェックを付ける（unit_price が 0 のときは提案価格を採用）。 */
export function priceItem(d: Db, customerId: number, item: DraftItem, opts: { excludeQuoteId?: number } = {}): DraftItem {
  if (!item.product_id) return { ...item, proposal: null, checks: [], supplier_options: [] };
  const p = proposePrice(d, item.product_id, customerId, item.qty, opts);
  const settings = getSettings(d);
  const options = currentSupplierPrices(d, item.product_id);
  const supplier_id = item.supplier_id && options.some((o) => o.supplier_id === item.supplier_id) ? item.supplier_id : (p.best_supplier_id ?? null);
  const cost = options.find((o) => o.supplier_id === supplier_id)?.cost ?? item.cost ?? 0;
  const unit_price = item.unit_price > 0 ? item.unit_price : p.proposed_price;
  const checks = checkPrice(p, unit_price, cost, supplier_id, settings);
  return { ...item, unit: item.unit || p.product.unit, unit_price, cost, supplier_id, supplier_options: options, proposal: summarize(p), checks };
}
