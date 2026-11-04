/**
 * 写真→商品の特定→同等品：AI が読み取った品番・品名を自社マスタに当て、無ければ同じ区分の取扱品とウェブ検索用の問い合わせ文を返す。
 */
import type { Db } from "../db/connection";
import { currentSupplierPrices, findProducts, listProducts } from "./repo";
import type { Product } from "./types";
import type { ProductPhotoReading } from "../ai/product-photo";

export interface IdentifiedProduct {
  reading: ProductPhotoReading;
  /** 自社マスタで一致した商品（品番一致を優先）。 */
  matches: { product: Product; how: "part_number" | "name" | "text"; best_cost: number | null }[];
  /** 同じ区分の取扱品（同等品の候補）。 */
  similar: Product[];
  /** ウェブ検索に使う問い合わせ文。 */
  research_query: string;
  research_context: string;
}

export function identifyProduct(db: Db, reading: ProductPhotoReading): IdentifiedProduct {
  const matches: IdentifiedProduct["matches"] = [];
  const push = (ps: Product[], how: IdentifiedProduct["matches"][number]["how"]) => { for (const p of ps) if (!matches.some((m) => m.product.id === p.id)) matches.push({ product: p, how, best_cost: currentSupplierPrices(db, p.id)[0]?.cost ?? null }); };
  if (reading.part_number) push(findProducts(db, reading.part_number, 3), "part_number");
  if (reading.name) push(findProducts(db, reading.name, 3), "name");
  for (const t of reading.visible_text.slice(0, 6)) if (t.length >= 3) push(findProducts(db, t, 2), "text");
  const cat = reading.category_guess?.trim();
  const all = listProducts(db);
  const similar = (cat ? all.filter((p) => p.category.includes(cat) || cat.includes(p.category)) : [])
    .filter((p) => !matches.some((m) => m.product.id === p.id)).slice(0, 6);
  const research_query = [reading.maker, reading.part_number, reading.name].filter(Boolean).join(" ") || reading.visible_text.slice(0, 3).join(" ") || "商品の同等品";
  const research_context = `写真から読み取り: ${[reading.maker, reading.part_number, reading.name, reading.spec].filter(Boolean).join(" / ")}。得意先の工場で使われている現行品の同等品・後継品・サイズ違いを知りたい`;
  return { reading, matches: matches.slice(0, 5), similar, research_query, research_context };
}
