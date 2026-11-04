/**
 * 値付けルール（掛率／粗利率／端数切り捨て）の純粋関数。
 * ブラウザでも使えるよう DB や Node 依存を持たない（shared.ts から公開）。
 */
import type { Customer, PricingMode, Supplier } from "./types";

export interface PricingRule {
  mode: Exclude<PricingMode, "none">;
  /** markup なら掛率（例 1.3）、margin なら粗利率 %（例 25）。 */
  rate: number;
  /** 端数の切り捨て単位（1・10・100 円）。 */
  rounding_unit: number;
  source: "customer" | "supplier";
  /** 画面用の短い説明（例「掛率 1.30・100円単位切り捨て（得意先ルール）」）。 */
  label: string;
}

/** n を unit 単位で切り捨てる（unit が 1 以下なら整数に切り捨て）。 */
export function floorTo(n: number, unit: number): number {
  const u = unit > 1 ? unit : 1;
  return Math.floor(n / u) * u;
}

/** 得意先ルールを優先し、無ければ仕入れ先の標準掛率を使う。どちらも無ければ null。 */
export function resolvePricingRule(customer: Pick<Customer, "pricing_mode" | "markup_rate" | "margin_pct" | "rounding_unit"> | null, supplier: Pick<Supplier, "markup_rate"> | null): PricingRule | null {
  const unit = customer?.rounding_unit && customer.rounding_unit > 1 ? customer.rounding_unit : 1;
  const unitLabel = unit > 1 ? `・${unit}円単位切り捨て` : "";
  if (customer?.pricing_mode === "markup" && customer.markup_rate && customer.markup_rate > 0) {
    return { mode: "markup", rate: customer.markup_rate, rounding_unit: unit, source: "customer", label: `掛率 ${customer.markup_rate.toFixed(2)}${unitLabel}（得意先ルール）` };
  }
  if (customer?.pricing_mode === "margin" && customer.margin_pct != null && customer.margin_pct > 0 && customer.margin_pct < 100) {
    return { mode: "margin", rate: customer.margin_pct, rounding_unit: unit, source: "customer", label: `粗利 ${customer.margin_pct}%${unitLabel}（得意先ルール）` };
  }
  if (supplier?.markup_rate && supplier.markup_rate > 0) {
    return { mode: "markup", rate: supplier.markup_rate, rounding_unit: unit, source: "supplier", label: `掛率 ${supplier.markup_rate.toFixed(2)}${unitLabel}（仕入れ先の標準）` };
  }
  return null;
}

/** 仕入れ値にルールを当てた売価。 */
export function rulePrice(cost: number, rule: PricingRule): number {
  if (!(cost > 0)) return 0;
  const raw = rule.mode === "markup" ? cost * rule.rate : cost / (1 - rule.rate / 100);
  return floorTo(raw, rule.rounding_unit);
}
