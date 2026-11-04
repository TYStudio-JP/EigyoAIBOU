import type { Db } from "../db/connection";
import { ROUTE_LABEL, type Product, type Settings, type SupplierPrice } from "./types";
import { currentSupplierPrices, getCustomer, getProduct, getSettings, getSupplier, priceHistory, type PriceHistoryRow } from "./repo";
import { resolvePricingRule, rulePrice, type PricingRule } from "./pricing-rule";

export type CheckLevel = "ok" | "info" | "warn" | "danger";
export interface PriceCheck {
  code:
    | "below_last_price"      // 同一得意先の前回単価より安い
    | "above_last_price"      // 前回より高い（値上げ）
    | "margin_below_floor"    // 粗利率が下限を下回る
    | "negative_margin"       // 原価割れ（赤字）
    | "below_other_customers" // 他社への売価より安い
    | "above_other_customers" // 他社への売価より高い
    | "cheaper_route"         // もっと安い仕入れルートがある
    | "no_history"            // 履歴なし（新規品）
    | "min_lot"               // 最小ロット未満
    | "off_rule";             // 得意先の値付けルール（掛率／粗利）と違う
  level: CheckLevel;
  title: string;
  detail: string;
}

export interface PriceProposal {
  product: Product;
  qty: number;
  /** 提案単価（履歴に基づく）。 */
  proposed_price: number;
  proposal_basis: string;
  /** 最安仕入れ。 */
  best_cost: number | null;
  best_supplier_id: number | null;
  best_supplier_name: string | null;
  best_route: string | null;
  supplier_options: SupplierPrice[];
  /** 粗利下限を守れる最低売価（ここまでなら値引き可能）。 */
  floor_price: number | null;
  /** 推奨粗利率での売価。 */
  target_price: number | null;
  last_same_customer: PriceHistoryRow | null;
  other_customers: { min: number; max: number; avg: number; count: number; rows: PriceHistoryRow[] } | null;
  history: PriceHistoryRow[];
  /** 得意先（または仕入れ先）の値付けルールと、最安仕入れにそれを当てた売価（「いつもの掛率なら」）。 */
  rule: PricingRule | null;
  rule_price: number | null;
}

export const round = (n: number, digits = 0): number => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};
export const marginPct = (price: number, cost: number): number => (price > 0 ? ((price - cost) / price) * 100 : 0);

/** 商品×得意先×数量 から、履歴を踏まえた提案単価と関連情報を組み立てる。 */
export function proposePrice(db: Db, productId: number, customerId: number, qty: number, opts: { excludeQuoteId?: number; asOf?: string } = {}): PriceProposal {
  const product = getProduct(db, productId);
  if (!product) throw new Error(`product ${productId} not found`);
  const settings = getSettings(db);
  const options = currentSupplierPrices(db, productId, opts.asOf);
  const best = options[0] ?? null;
  const history = priceHistory(db, productId, { limit: 30, excludeQuoteId: opts.excludeQuoteId });
  const same = history.filter((h) => h.customer_id === customerId);
  const lastSame = same.find((h) => h.status === "won") ?? same[0] ?? null;
  const othersRows = history.filter((h) => h.customer_id !== customerId && h.status !== "lost");
  const others = othersRows.length
    ? {
        min: Math.min(...othersRows.map((r) => r.unit_price)),
        max: Math.max(...othersRows.map((r) => r.unit_price)),
        avg: round(othersRows.reduce((s, r) => s + r.unit_price, 0) / othersRows.length, 1),
        count: othersRows.length,
        rows: othersRows.slice(0, 5),
      }
    : null;

  const floor = best ? round(best.cost / (1 - settings.margin_floor_pct / 100)) : null;
  const target = best ? round(best.cost / (1 - settings.margin_target_pct / 100)) : null;
  const rule = resolvePricingRule(getCustomer(db, customerId), best ? getSupplier(db, best.supplier_id) : null);
  const rulePx = rule && best ? rulePrice(best.cost, rule) : null;

  let proposed: number;
  let basis: string;
  if (lastSame) {
    proposed = lastSame.unit_price;
    basis = `${lastSame.date.slice(0, 10)} の同得意先向け${lastSame.status === "won" ? "受注" : "提出"}単価（${lastSame.quote_no}）を踏襲`;
    if (rulePx && Math.abs(rulePx - proposed) / proposed > 0.01) basis += `（いつもの${rule!.mode === "markup" ? "掛率" : "粗利"}なら ${rulePx.toLocaleString()} 円）`;
  } else if (rulePx) {
    proposed = rulePx;
    basis = `同得意先の履歴なし。最安仕入れ（${best!.supplier_name} ${best!.cost.toLocaleString()} 円）に ${rule!.label} を当てた価格`;
  } else if (others) {
    proposed = others.avg;
    basis = `同得意先の履歴なし。他社向け平均単価（${others.count}件）を採用`;
  } else if (target) {
    proposed = Math.min(target, product.list_price);
    basis = `履歴なし。最安仕入れ（${best!.supplier_name}）に推奨粗利 ${settings.margin_target_pct}% を乗せた価格`;
  } else {
    proposed = product.list_price;
    basis = "履歴・仕入れ情報なし。定価を採用";
  }
  // 前回より原価が上がり、提案価格が下限を割るなら下限まで引き上げる
  if (floor !== null && proposed < floor) {
    basis += `。ただし現在の仕入れでは粗利下限 ${settings.margin_floor_pct}% を割るため下限価格 ${floor.toLocaleString()} 円に引き上げ`;
    proposed = floor;
  }
  return {
    product,
    qty,
    proposed_price: round(proposed),
    proposal_basis: basis,
    best_cost: best?.cost ?? null,
    best_supplier_id: best?.supplier_id ?? null,
    best_supplier_name: best?.supplier_name ?? null,
    best_route: best ? ROUTE_LABEL[best.route_type] : null,
    supplier_options: options,
    floor_price: floor,
    target_price: target,
    last_same_customer: lastSame,
    other_customers: others,
    history,
    rule,
    rule_price: rulePx,
  };
}

/** 候補単価・原価・数量に対してチェックを走らせる。 */
export function checkPrice(
  proposal: PriceProposal,
  unitPrice: number,
  cost: number,
  supplierId: number | null,
  settings: Settings,
): PriceCheck[] {
  const checks: PriceCheck[] = [];
  const yen = (n: number) => `${round(n).toLocaleString()}円`;
  const m = marginPct(unitPrice, cost);

  if (cost > 0 && unitPrice < cost) {
    checks.push({ code: "negative_margin", level: "danger", title: "原価割れ（赤字）", detail: `売価 ${yen(unitPrice)} が仕入れ ${yen(cost)} を下回っています（粗利 ${round(m, 1)}%）。` });
  } else if (cost > 0 && m < settings.margin_floor_pct) {
    checks.push({ code: "margin_below_floor", level: "warn", title: `粗利率が下限 ${settings.margin_floor_pct}% 未満`, detail: `粗利 ${round(m, 1)}%。下限を守るなら ${yen(proposal.floor_price ?? cost)} 以上が必要です。` });
  }

  const last = proposal.last_same_customer;
  if (last) {
    const diffPct = ((unitPrice - last.unit_price) / last.unit_price) * 100;
    if (diffPct <= -settings.last_price_drop_warn_pct) {
      checks.push({ code: "below_last_price", level: "warn", title: "前回単価より値下げ", detail: `${last.date.slice(0, 10)} の ${yen(last.unit_price)}（${last.quote_no}）から ${round(-diffPct, 1)}% 下げています。値下げ理由を備考に残してください。` });
    } else if (diffPct >= 5) {
      checks.push({ code: "above_last_price", level: "info", title: "前回単価より値上げ", detail: `${last.date.slice(0, 10)} の ${yen(last.unit_price)} から ${round(diffPct, 1)}% 上げています。価格改定の説明が必要です。` });
    }
  } else {
    checks.push({ code: "no_history", level: "info", title: "この得意先への販売実績なし", detail: proposal.other_customers ? `他社向け実績 ${proposal.other_customers.count}件（${yen(proposal.other_customers.min)}〜${yen(proposal.other_customers.max)}）を参考にしてください。` : "初めて扱う商品です。仕入れ先に最新単価を確認してください。" });
  }

  // 他社との整合性チェックは「新しく価格を決める」ときに意味がある。前回単価を踏襲しているなら既に合意済みの価格なので省く。
  const o = proposal.other_customers;
  const keepsLastPrice = last ? Math.abs(unitPrice - last.unit_price) / last.unit_price < 0.01 : false;
  if (o && !keepsLastPrice) {
    if (unitPrice < o.min * 0.97) {
      checks.push({ code: "below_other_customers", level: "warn", title: "他の得意先より安い", detail: `他社向け最安 ${yen(o.min)} をさらに下回ります。価格の整合性に注意。` });
    } else if (unitPrice > o.max * 1.1) {
      checks.push({ code: "above_other_customers", level: "info", title: "他の得意先より高い", detail: `他社向け最高 ${yen(o.max)} より 10% 以上高い設定です。` });
    }
  }

  if (supplierId && proposal.supplier_options.length > 1) {
    const chosen = proposal.supplier_options.find((s) => s.supplier_id === supplierId);
    const best = proposal.supplier_options[0];
    if (chosen && best.supplier_id !== chosen.supplier_id && chosen.cost > best.cost) {
      checks.push({ code: "cheaper_route", level: "info", title: "より安い仕入れルートあり", detail: `${best.supplier_name}（${ROUTE_LABEL[best.route_type]}）なら ${yen(best.cost)}、現在の ${chosen.supplier_name} より ${yen(chosen.cost - best.cost)} 安い。納期 ${best.lead_time_days ?? "-"} 日。` });
    }
  }
  const chosenOpt = proposal.supplier_options.find((s) => s.supplier_id === supplierId);
  if (chosenOpt && proposal.qty < chosenOpt.min_lot) {
    checks.push({ code: "min_lot", level: "warn", title: "最小ロット未満", detail: `${chosenOpt.supplier_name} の最小ロットは ${chosenOpt.min_lot}${proposal.product.unit}。数量 ${proposal.qty} では仕入れできない可能性があります。` });
  }
  // 得意先の値付けルールと違う（前回単価を踏襲している場合は合意済みなので省く）
  if (proposal.rule && cost > 0 && !keepsLastPrice) {
    const rp = rulePrice(cost, proposal.rule);
    if (rp > 0 && Math.abs(unitPrice - rp) / rp > 0.01) {
      checks.push({ code: "off_rule", level: "info", title: "いつもの掛率・粗利と違う", detail: `${proposal.rule.label}なら ${yen(rp)}。今の単価は ${unitPrice > rp ? "高め" : "安め"}（${yen(Math.abs(unitPrice - rp))} 差）。意図した価格か確認してください。` });
    }
  }
  return checks;
}

export function worstLevel(checks: PriceCheck[]): CheckLevel {
  const order: CheckLevel[] = ["ok", "info", "warn", "danger"];
  return checks.reduce<CheckLevel>((w, c) => (order.indexOf(c.level) > order.indexOf(w) ? c.level : w), "ok");
}
