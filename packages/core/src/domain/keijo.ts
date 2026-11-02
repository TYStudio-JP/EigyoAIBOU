import type { Db } from "../db/connection";
import type { QuoteWithItems } from "./types";
import { getQuote, getSupplier, priceHistory } from "./repo";
import { marginPct, round } from "./pricing";

/** 伝票計上の指示行。事務員（または自分）が基幹システムに入力するための 1 行。 */
export interface KeijoRow {
  line_no: number;
  product_code: string;       // 自社商品コード（未登録品は空）
  part_number: string;
  description: string;
  qty: number;
  unit: string;
  sell_price: number;
  sell_amount: number;
  supplier_code: string;
  supplier_name: string;
  cost: number;
  cost_amount: number;
  margin_pct: number;
  delivery: string;           // 納期（仕入れ先回答 or 回答納期）
  flags: string[];            // 確認事項（赤表示）
}
export interface KeijoSheet {
  quote: QuoteWithItems;
  customer_code: string;
  rows: KeijoRow[];
  total_sell: number;
  total_cost: number;
  flags: string[];            // ヘッダ単位の確認事項
}

/** 受注見積りから計上指示を組み立て、見積りと基幹の整合に関わる差異を機械的に洗い出す。 */
export function buildKeijo(db: Db, quoteId: number, settings: { margin_floor_pct: number }): KeijoSheet {
  const q = getQuote(db, quoteId);
  if (!q) throw new Error("quote not found");
  const flags: string[] = [];
  if (q.status !== "won") flags.push(`見積りは「${{ draft: "下書き", submitted: "提出済", tracking: "追跡中", lost: "失注", won: "受注" }[q.status]}」です。受注確定前の計上は不可`);
  if (!q.promised_delivery && !q.requested_delivery) flags.push("納期が未設定");
  const rows: KeijoRow[] = q.items.map((it) => {
    const f: string[] = [];
    const sup = it.supplier ?? (it.supplier_id ? getSupplier(db, it.supplier_id) : null);
    if (!it.product) f.push("未登録品：商品コードを採番してから計上");
    if (!sup) f.push("仕入れ先が未設定");
    if (it.unit_price <= 0) f.push("売単価が 0");
    if (it.cost > 0 && it.unit_price < it.cost) f.push("原価割れ");
    else if (it.cost > 0 && marginPct(it.unit_price, it.cost) < settings.margin_floor_pct) f.push(`粗利 ${round(marginPct(it.unit_price, it.cost), 1)}%（下限未満）`);
    if (it.product_id) {
      const hist = priceHistory(db, it.product_id, { customerId: q.customer_id, excludeQuoteId: q.id, limit: 5 }).filter((h) => h.status === "won");
      const last = hist[0];
      if (last && Math.abs(last.unit_price - it.unit_price) / last.unit_price >= 0.01) f.push(`前回受注単価 ${round(last.unit_price).toLocaleString()}円（${last.date.slice(0, 10)}）と異なる → 基幹の単価マスタを更新`);
    }
    if (!it.supplier_delivery) f.push("仕入れ先の納期回答なし");
    return {
      line_no: it.line_no, product_code: it.product?.code ?? "", part_number: it.product?.part_number ?? "", description: it.description, qty: it.qty, unit: it.unit,
      sell_price: it.unit_price, sell_amount: round(it.qty * it.unit_price), supplier_code: sup?.code ?? "", supplier_name: sup?.name ?? "", cost: it.cost, cost_amount: round(it.qty * it.cost),
      margin_pct: round(marginPct(it.unit_price, it.cost), 1), delivery: it.supplier_delivery ?? q.promised_delivery ?? q.requested_delivery ?? "", flags: f,
    };
  });
  return { quote: q, customer_code: q.customer.code, rows, total_sell: round(q.total), total_cost: round(q.total_cost), flags };
}
