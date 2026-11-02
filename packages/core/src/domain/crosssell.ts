import type { Db } from "../db/connection";
import { getCustomer, getProduct, listCustomers, purchasedProducts, currentSupplierPrices } from "./repo";
import type { Customer, Product } from "./types";

export interface PeerEvidence {
  customer: Customer;
  similarity: number;
  last_date: string;
  total_qty: number;
  last_price: number;
}
export interface CrossSellCandidate {
  product: Product;
  score: number;
  peers: PeerEvidence[];
  reference_price: number;       // 同業への平均売価
  best_cost: number | null;
  reason: string;
}
export interface CrossSellResult {
  customer: Customer;
  peers: { customer: Customer; similarity: number; shared_categories: string[] }[];
  candidates: CrossSellCandidate[];
}

/** 同業（同じ業種）かつ購買カテゴリが似ている得意先で売れていて、対象得意先が未購入の商品を抽出する。 */
export function crossSellCandidates(db: Db, customerId: number, limit = 8): CrossSellResult {
  const customer = getCustomer(db, customerId);
  if (!customer) throw new Error(`customer ${customerId} not found`);
  const mine = purchasedProducts(db, customerId);
  const myProducts = new Set(mine.map((m) => m.product_id));
  const myCats = new Set(mine.map((m) => m.category));

  const peers = listCustomers(db)
    .filter((c) => c.id !== customerId && c.industry === customer.industry)
    .map((c) => {
      const theirs = purchasedProducts(db, c.id);
      const cats = new Set(theirs.map((t) => t.category));
      const shared = [...cats].filter((x) => myCats.has(x));
      const union = new Set([...cats, ...myCats]).size;
      // 業種一致で基礎点 0.4、カテゴリ重なり（Jaccard）で最大 0.6
      const similarity = 0.4 + (union ? (shared.length / union) * 0.6 : 0);
      return { customer: c, similarity, shared_categories: shared, purchases: theirs };
    })
    .sort((a, b) => b.similarity - a.similarity);

  const scoreMap = new Map<number, { score: number; peers: PeerEvidence[] }>();
  for (const p of peers) {
    for (const t of p.purchases) {
      if (myProducts.has(t.product_id)) continue;
      const entry = scoreMap.get(t.product_id) ?? { score: 0, peers: [] };
      entry.score += p.similarity * (1 + Math.log10(1 + t.total_qty));
      entry.peers.push({ customer: p.customer, similarity: p.similarity, last_date: t.last_date, total_qty: t.total_qty, last_price: t.last_price });
      scoreMap.set(t.product_id, entry);
    }
  }
  const candidates: CrossSellCandidate[] = [...scoreMap.entries()]
    .map(([pid, e]) => {
      const product = getProduct(db, pid)!;
      const cost = currentSupplierPrices(db, pid)[0]?.cost ?? null;
      const ref = e.peers.reduce((s, x) => s + x.last_price, 0) / e.peers.length;
      const sameCat = myCats.has(product.category);
      const names = e.peers.slice(0, 2).map((x) => x.customer.short_name).join("・");
      const reason = `${names}${e.peers.length > 2 ? ` ほか${e.peers.length - 2}社` : ""}（同業：${customer.industry}）で継続購入${sameCat ? `。${customer.short_name} も同カテゴリ「${product.category}」を購入中` : ""}`;
      return { product, score: e.score * (sameCat ? 1.3 : 1), peers: e.peers.sort((a, b) => b.similarity - a.similarity), reference_price: Math.round(ref), best_cost: cost, reason };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return { customer, peers: peers.map(({ customer, similarity, shared_categories }) => ({ customer, similarity, shared_categories })), candidates };
}
