import { addActivity, checkPrice, getQuote, getSettings, proposePrice, reviewQuote } from "@eigyo/core";
import { db } from "@/lib/db";
import { todayIso } from "@/lib/format";
import { fail, idOf, ok } from "../../../_util";

export const dynamic = "force-dynamic";

/** 機械チェック＋AI レビュー。 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const id = idOf(await ctx.params);
    const d = db();
    const q = getQuote(d, id);
    if (!q) return fail(new Error("not found"), 404);
    const settings = getSettings(d);
    const checks = q.items.map((it) => ({
      line_no: it.line_no, description: it.description,
      checks: it.product_id ? checkPrice(proposePrice(d, it.product_id, q.customer_id, it.qty, { excludeQuoteId: q.id }), it.unit_price, it.cost, it.supplier_id, settings) : [],
    }));
    const review = await reviewQuote(q, checks, settings, todayIso());
    addActivity(d, id, "ai", `AIレビュー（${review.verdict}）：${review.summary}`);
    return ok({ checks, review });
  } catch (e) { return fail(e); }
}
