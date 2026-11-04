import { notFound } from "next/navigation";
import { buildKeijo, checkPrice, currentSupplierPrices, formalDiff, getDeal, getQuote, getSettings, hasApiKey, listActivities, listDeals, proposePrice } from "@eigyo/core";
import { db } from "@/lib/db";
import { pickProduct, type DraftItem } from "@/lib/draft";
import { QuoteDetail, type LineCheck } from "@/components/quote-detail";
import { QuoteMobile } from "@/components/quote-mobile";

export const dynamic = "force-dynamic";

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = db();
  const q = getQuote(d, Number(id));
  if (!q) notFound();
  const settings = getSettings(d);
  const lines: LineCheck[] = q.items.map((it) => {
    const base: DraftItem = {
      raw_text: "", product_query: it.description, product_id: it.product_id, product: it.product ? pickProduct(it.product) : null, candidates: [],
      description: it.description, qty: it.qty, unit: it.unit, unit_price: it.unit_price, cost: it.cost, supplier_id: it.supplier_id,
      supplier_options: it.product_id ? currentSupplierPrices(d, it.product_id) : [], proposal: null, checks: [], remarks: it.remarks, is_new_for_customer: false, note: null,
    };
    if (!it.product_id) return { line_no: it.line_no, checks: [], draft: base };
    const p = proposePrice(d, it.product_id, q.customer_id, it.qty, { excludeQuoteId: q.id });
    const checks = checkPrice(p, it.unit_price, it.cost, it.supplier_id, settings);
    const proposal = {
      proposed_price: p.proposed_price, proposal_basis: p.proposal_basis, floor_price: p.floor_price, target_price: p.target_price, best_cost: p.best_cost, best_supplier_name: p.best_supplier_name,
      last_same_customer: p.last_same_customer, other_customers: p.other_customers ? { min: p.other_customers.min, max: p.other_customers.max, avg: p.other_customers.avg, count: p.other_customers.count } : null, history: p.history.slice(0, 8), rule: p.rule, rule_price: p.rule_price,
    };
    return { line_no: it.line_no, checks, draft: { ...base, proposal, checks } };
  });
  const deal = q.deal_id ? getDeal(d, q.deal_id) : null;
  const keijo = q.status === "won" ? (() => { const k = buildKeijo(d, q.id, settings); return { flags: k.flags, rows: k.rows.map((r) => ({ line_no: r.line_no, description: r.description, flags: r.flags })) }; })() : null;
  const ai = hasApiKey();
  const dealLite = deal ? { id: deal.id, title: deal.title, status: deal.status } : null;
  return (
    <>
      {/* スマホ：ポイント確認（明細カード＋下固定バー） */}
      <div className="lg:hidden"><QuoteMobile quote={q} lines={lines} aiEnabled={ai} deal={dealLite} diff={formalDiff(q)} /></div>
      {/* デスクトップ：従来の詳細画面 */}
      <div className="hidden lg:block"><QuoteDetail quote={q} activities={listActivities(d, q.id)} lines={lines} aiEnabled={ai} deal={dealLite} dealOptions={listDeals(d, { customerId: q.customer_id, openOnly: true, limit: 30 }).map((x) => ({ id: x.id, title: x.title }))} keijo={keijo} /></div>
    </>
  );
}
