import type { Db } from "../db/connection";
import { CUSTOMERS, INDUSTRY_AFFINITY, PRODUCTS, SUPPLIERS } from "./data";
import {
  addActivity, addDays, addSupplierPrice, createQuote, getSettings, saveSettings, setQuoteStatus, today,
  upsertCustomer, upsertProduct, upsertSupplier, type NewQuoteItem,
} from "../domain/repo";
import { DEFAULT_SETTINGS, type LostReason } from "../domain/types";

/** 決定的な乱数（デモが毎回同じ結果になるように）。 */
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SeedOptions { asOf?: string; seed?: number; quotes?: number }

export function seedDatabase(db: Db, opts: SeedOptions = {}): { customers: number; suppliers: number; products: number; quotes: number } {
  const asOf = opts.asOf ?? today();
  const rnd = mulberry32(opts.seed ?? 20261102);
  const pick = <T>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
  const between = (a: number, b: number) => a + rnd() * (b - a);

  db.exec("DELETE FROM activities; DELETE FROM quote_items; DELETE FROM quotes; DELETE FROM supplier_prices; DELETE FROM products; DELETE FROM suppliers; DELETE FROM customers; DELETE FROM settings;");
  saveSettings(db, DEFAULT_SETTINGS);

  const customers = CUSTOMERS.map((c) => ({ ...upsertCustomer(db, c), discount: c.discount }));
  const supplierByCode = new Map(SUPPLIERS.map((s) => [s.code, upsertSupplier(db, s)]));
  const products = PRODUCTS.map((p) => {
    const row = upsertProduct(db, p);
    for (const r of p.routes) {
      const sup = supplierByCode.get(r.supplier)!;
      addSupplierPrice(db, { product_id: row.id, supplier_id: sup.id, cost: Math.round(p.list_price * r.ratio), min_lot: r.min_lot, lead_time_days: r.lead ?? sup.lead_time_days, valid_from: "2024-01-01" });
      if (p.revised) {
        // 価格改定：各ルートとも同じ比率で上昇
        const bump = p.revised.ratio / p.routes[0].ratio;
        addSupplierPrice(db, { product_id: row.id, supplier_id: sup.id, cost: Math.round(p.list_price * r.ratio * bump), min_lot: r.min_lot, lead_time_days: r.lead ?? sup.lead_time_days, valid_from: p.revised.from });
      }
    }
    return { ...row, seed: p };
  });

  // 得意先ごとの「取扱品目」= 業種の親和カテゴリから抽選（得意先ごとに差が出るようにする）
  const assortment = new Map<number, typeof products>();
  for (const c of customers) {
    const aff = INDUSTRY_AFFINITY[c.industry];
    const pool = products.filter((p) => aff[p.category]);
    const chosen = pool.filter((p) => rnd() < Math.min(0.95, 0.25 + aff[p.category] * 0.12));
    assortment.set(c.id, chosen.length >= 3 ? chosen : pool.slice(0, 4));
  }

  const costAt = (productId: number, supplierId: number, date: string): number => {
    const row = db.prepare(
      "SELECT cost FROM supplier_prices WHERE product_id=? AND supplier_id=? AND valid_from<=? ORDER BY valid_from DESC LIMIT 1",
    ).get(productId, supplierId, date) as { cost: number } | undefined;
    return row?.cost ?? 0;
  };

  const start = addDays(asOf, -720);
  const total = opts.quotes ?? 150;
  let made = 0;
  const lostReasons: LostReason[] = ["price", "price", "delivery", "competitor", "cancelled", "other"];
  const lostDetails: Record<LostReason, string[]> = {
    price: ["他社が1割安かった", "予算超過のため見送り", "値引き交渉が折り合わず"],
    delivery: ["希望納期に間に合わず", "メーカー欠品で納期回答できず"],
    competitor: ["既存取引先に決定", "メーカー直販に切り替え"],
    cancelled: ["案件自体が延期", "設備投資が凍結"],
    other: ["理由不明（先方から回答なし）"],
  };

  // 時間軸：全体はほぼ一様、直近3週間に 16 件を追加して「動いている案件」を作る。古い順に採番する。
  const schedule: number[] = [];
  for (let i = 0; i < total; i++) schedule.push(Math.floor(rnd() * 720));
  for (let i = 0; i < 16; i++) schedule.push(Math.floor(rnd() * 21));
  schedule.sort((a, b) => b - a);
  for (const daysAgo of schedule) {
    const created = addDays(asOf, -daysAgo);
    if (created < start) continue;
    const c = pick(customers);
    const items: NewQuoteItem[] = [];
    const nItems = 1 + Math.floor(rnd() * 4);
    const cands = [...assortment.get(c.id)!];
    for (let k = 0; k < nItems && cands.length; k++) {
      const p = cands.splice(Math.floor(rnd() * cands.length), 1)[0];
      const routes = p.seed.routes;
      // 大口は メーカー直、小口は 代理店/商社
      const qtyBase = { 組: 50, 双: 30, 個: 10, 箱: 6, 足: 10, 巻: 10, 束: 10, 本: 5, 缶: 4, 袋: 10, 台: 2 }[p.unit] ?? 5;
      const qty = Math.max(1, Math.round(qtyBase * between(0.5, 2.5)));
      const route = qty >= (routes[0].min_lot) ? routes[0] : routes[routes.length - 1];
      const sup = supplierByCode.get(route.supplier)!;
      const cost = costAt(p.id, sup.id, created);
      // 顧客ごとの掛け率 ± 2%。年ごとに微妙にドリフト
      const drift = 1 + (720 - daysAgo) / 720 * 0.03;
      const price = Math.round((p.list_price * c.discount * between(0.98, 1.02) * drift) / 10) * 10;
      items.push({ product_id: p.id, description: `${p.name}（${p.part_number}）`, qty, unit: p.unit, unit_price: Math.max(price, Math.round(cost * 1.05)), cost, supplier_id: sup.id, supplier_delivery: addDays(created, (route.lead ?? sup.lead_time_days) + 1) });
    }
    if (!items.length) continue;
    const r = rnd();
    let status: "draft" | "submitted" | "tracking" | "won" | "lost";
    if (daysAgo <= 2) status = r < 0.5 ? "draft" : "submitted";
    else if (daysAgo <= 21) status = r < 0.15 ? "draft" : r < 0.55 ? "submitted" : r < 0.8 ? "tracking" : r < 0.92 ? "won" : "lost";
    else status = r < 0.72 ? "won" : "lost";
    const subjects = ["消耗品 定期分", "追加発注分", "新規ライン立ち上げ分", "年度更新分", "在庫補充分", "スポット分", "見積り依頼分"];
    const q = createQuote(db, {
      customer_id: c.id,
      subject: `${created.slice(0, 7).replace("-", "年")}月 ${pick(subjects)}`,
      status: "draft",
      requested_delivery: addDays(created, 7 + Math.floor(rnd() * 14)),
      promised_delivery: addDays(created, 8 + Math.floor(rnd() * 10)),
      valid_until: addDays(created, 30),
      source_type: pick(["email", "email", "memo", "file", "manual"]),
      items,
      created_at: `${created} 09:${String(10 + Math.floor(rnd() * 49)).padStart(2, "0")}:00`,
    });
    if (status !== "draft") {
      const submitted = addDays(created, Math.floor(rnd() * 2));
      setQuoteStatus(db, q.id, "submitted", { at: `${submitted} 11:00:00` });
      if (status === "tracking" || ((status === "won" || status === "lost") && rnd() < 0.6)) {
        const fu = addDays(submitted, 3 + Math.floor(rnd() * 4));
        if (fu <= asOf) {
          setQuoteStatus(db, q.id, "tracking", { at: `${fu} 10:00:00` });
          addActivity(db, q.id, "followup", pick(["電話で状況確認。購買で検討中とのこと", "訪問時に確認。来週中に回答予定", "メールでフォロー。数量変更の可能性あり", "先方担当者不在。再度連絡予定"]), `${fu} 10:05:00`);
        }
      }
      if (status === "won" || status === "lost") {
        const closed = addDays(submitted, 5 + Math.floor(rnd() * 20));
        if (closed <= asOf) {
          if (status === "won") setQuoteStatus(db, q.id, "won", { at: `${closed} 15:00:00`, note: pick(["注文書受領", "口頭内示→注文書待ち", "そのまま受注"]) });
          else {
            const reason = pick(lostReasons);
            setQuoteStatus(db, q.id, "lost", { at: `${closed} 15:00:00`, lost_reason: reason, lost_detail: pick(lostDetails[reason]) });
          }
        }
      }
    }
    made++;
  }

  // デモ用に固定の「追跡が必要な案件」を 2 件追加
  const midori = customers.find((c) => c.code === "C003")!;
  const tokai = customers.find((c) => c.code === "C001")!;
  const prod = (code: string) => products.find((p) => p.code === code)!;
  const mk = (p: ReturnType<typeof prod>, qty: number, price: number, supCode: string, date: string): NewQuoteItem => ({
    product_id: p.id, description: `${p.name}（${p.part_number}）`, qty, unit: p.unit, unit_price: price,
    cost: costAt(p.id, supplierByCode.get(supCode)!.id, date), supplier_id: supplierByCode.get(supCode)!.id,
  });
  const d1 = addDays(asOf, -9);
  const q1 = createQuote(db, {
    customer_id: midori.id, subject: "年末繁忙期向け 衛生・梱包資材", status: "draft", requested_delivery: addDays(asOf, 12), valid_until: addDays(d1, 30), source_type: "email",
    source_text: "高橋です。年末向けに工業用ワイパー 20箱、ゴミ袋90L 10箱、OPPテープ 8箱の見積りをお願いします。納期は再来週希望です。",
    items: [mk(prod("P7002"), 20, 6700, "S02", d1), mk(prod("P7003"), 10, 5300, "S02", d1), mk(prod("P2004"), 8, 5500, "S02", d1)],
    created_at: `${d1} 10:20:00`,
  });
  setQuoteStatus(db, q1.id, "submitted", { at: `${d1} 16:30:00` });
  const d2 = addDays(asOf, -16);
  const q2 = createQuote(db, {
    customer_id: tokai.id, subject: "第2ライン 切削工具・切削油", status: "draft", requested_delivery: addDays(asOf, 5), valid_until: addDays(d2, 30), source_type: "memo",
    source_text: "佐藤さんより電話。第2ラインの立ち上げでエンドミルφ10を10本、CNMGチップ5箱、切削油18Lを8缶。来月頭には必要。",
    items: [mk(prod("P3001"), 10, 7600, "S03", d2), mk(prod("P3003"), 5, 9300, "S03", d2), mk(prod("P4001"), 8, 10900, "S04", d2)],
    created_at: `${d2} 09:40:00`,
  });
  setQuoteStatus(db, q2.id, "submitted", { at: `${d2} 14:00:00` });
  setQuoteStatus(db, q2.id, "tracking", { at: `${addDays(d2, 4)} 10:00:00` });
  addActivity(db, q2.id, "followup", "訪問時に確認。購買の稟議中、競合1社あり（価格勝負になりそう）", `${addDays(d2, 4)} 10:10:00`);

  getSettings(db);
  return { customers: customers.length, suppliers: SUPPLIERS.length, products: products.length, quotes: made + 2 };
}
