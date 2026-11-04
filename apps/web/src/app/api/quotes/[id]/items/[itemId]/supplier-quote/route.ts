import { getQuote, recordSupplierQuote } from "@eigyo/core";
import { db } from "@/lib/db";
import { fail, idOf, ok } from "../../../../../_util";

export const dynamic = "force-dynamic";

/** メーカー回答（単価・納期・有効期限・最小ロット）を明細に記録し、apply_rule なら得意先ルールで売単価を更新する。 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string; itemId: string }> }) {
  try {
    const p = await ctx.params;
    const quoteId = idOf({ id: p.id }); const itemId = idOf({ id: p.itemId });
    const d = db();
    if (!getQuote(d, quoteId)) return fail(new Error("not found"), 404);
    const b = (await req.json()) as { price?: number | null; delivery?: string | null; valid_until?: string | null; min_lot?: number | null; note?: string | null; apply_rule?: boolean };
    for (const k of ["delivery", "valid_until"] as const) if (b[k] && !/^\d{4}-\d{2}-\d{2}$/.test(b[k]!)) return fail(new Error(`${k === "delivery" ? "納期" : "有効期限"}は YYYY-MM-DD で指定してください`), 400);
    if (b.price != null && !(Number(b.price) >= 0)) return fail(new Error("単価が不正です"), 400);
    if (b.price == null && !b.delivery && !b.valid_until && b.min_lot == null && !b.note) return fail(new Error("単価・納期・有効期限のいずれかを入力してください"), 400);
    return ok(recordSupplierQuote(d, quoteId, itemId, { ...b, price: b.price == null ? null : Number(b.price), min_lot: b.min_lot == null ? null : Math.round(Number(b.min_lot)) }));
  } catch (e) { return fail(e); }
}
