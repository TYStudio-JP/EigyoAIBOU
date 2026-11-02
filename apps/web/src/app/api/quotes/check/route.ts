import { db } from "@/lib/db";
import { priceItem, type DraftItem } from "@/lib/draft";
import { fail, ok } from "../../_util";

export const dynamic = "force-dynamic";

/** 明細配列に対して価格提案とチェックを再計算する（編集中にリアルタイムで呼ぶ）。 */
export async function POST(req: Request) {
  try {
    const b = (await req.json()) as { customer_id: number; exclude_quote_id?: number; items: DraftItem[]; reset_price?: boolean };
    const d = db();
    const items = b.items.map((it) => priceItem(d, b.customer_id, b.reset_price ? { ...it, unit_price: 0 } : it, { excludeQuoteId: b.exclude_quote_id }));
    return ok({ items });
  } catch (e) {
    return fail(e);
  }
}
