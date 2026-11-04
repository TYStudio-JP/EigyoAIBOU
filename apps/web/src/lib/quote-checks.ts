import "server-only";
import { checkPrice, getSettings, proposePrice, type Db, type PriceCheck, type QuoteWithItems } from "@eigyo/core";

export interface QuoteLineChecks { line_no: number; description: string; checks: PriceCheck[] }

/** 保存済み見積りの各明細に対する機械チェック（レビュー・自分宛てメール・ポイント確認で共用）。 */
export function quoteLineChecks(d: Db, q: QuoteWithItems): QuoteLineChecks[] {
  const settings = getSettings(d);
  return q.items.map((it) => ({
    line_no: it.line_no, description: it.description,
    checks: it.product_id ? checkPrice(proposePrice(d, it.product_id, q.customer_id, it.qty, { excludeQuoteId: q.id }), it.unit_price, it.cost, it.supplier_id, settings) : [],
  }));
}
