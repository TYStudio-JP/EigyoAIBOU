import type { Db } from "../db/connection";
import type { Customer, Product } from "./types";
import { currentSupplierPrices, getCustomer, getProduct, getSettings, listCustomers, listSuppliers, purchasedProducts } from "./repo";
import { marginPct, round } from "./pricing";

/** 得意先×商品ごとの「現在の仕入れで、直近の受注単価だとどうなるか」。値上げ交渉の優先順位に使う。 */
export interface ImpactRow {
  customer: Customer;
  product: Product;
  last_price: number;        // 直近の受注単価
  last_date: string;
  annual_qty: number;        // 累計数量（簡易に年間換算せずそのまま）
  cost_now: number;          // 現在の最安仕入れ（シミュレーション後）
  cost_before: number;       // シミュレーション前
  margin_now: number;
  margin_before: number;
  needed_price: number;      // 粗利下限を守る売価
  gap_amount: number;        // (needed_price - last_price) × 数量 = 交渉で取り戻すべき額
  level: "danger" | "warn" | "ok";
}
export interface ImpactSim { supplier_id?: number | null; product_ids?: number[]; category?: string | null; pct: number }

export function priceImpact(db: Db, sim: ImpactSim | null = null): { rows: ImpactRow[]; floor_pct: number; suppliers: { id: number; name: string }[]; categories: string[] } {
  const settings = getSettings(db);
  const floor = settings.margin_floor_pct;
  const rows: ImpactRow[] = [];
  const hit = (p: Product, supplierId: number) => !sim || ((!sim.supplier_id || sim.supplier_id === supplierId) && (!sim.product_ids?.length || sim.product_ids.includes(p.id)) && (!sim.category || sim.category === p.category));
  for (const c of listCustomers(db)) {
    for (const b of purchasedProducts(db, c.id)) {
      const p = getProduct(db, b.product_id)!;
      const routes = currentSupplierPrices(db, p.id);
      if (!routes.length || !b.last_price) continue;
      const before = routes[0].cost;
      const simulated = routes.map((r) => ({ ...r, cost: hit(p, r.supplier_id) ? round(r.cost * (1 + (sim?.pct ?? 0) / 100)) : r.cost })).sort((a, b2) => a.cost - b2.cost);
      const now = simulated[0].cost;
      const mNow = marginPct(b.last_price, now);
      const mBefore = marginPct(b.last_price, before);
      const needed = round(now / (1 - floor / 100));
      const level: ImpactRow["level"] = b.last_price < now ? "danger" : mNow < floor ? "warn" : "ok";
      if (level === "ok" && !sim) continue;
      rows.push({ customer: c, product: p, last_price: b.last_price, last_date: b.last_date, annual_qty: b.total_qty, cost_now: now, cost_before: before, margin_now: round(mNow, 1), margin_before: round(mBefore, 1), needed_price: needed, gap_amount: round(Math.max(0, needed - b.last_price) * b.total_qty), level });
    }
  }
  rows.sort((a, b) => ({ danger: 0, warn: 1, ok: 2 }[a.level] - { danger: 0, warn: 1, ok: 2 }[b.level]) || b.gap_amount - a.gap_amount);
  const categories = [...new Set(rows.map((r) => r.product.category))];
  return { rows, floor_pct: floor, suppliers: listSuppliers(db).map((s) => ({ id: s.id, name: s.name })), categories };
}
export { getCustomer as _getCustomerRef };
