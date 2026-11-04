import { crossSellCandidates, dismissCrossSell, getProduct, undismissCrossSell, type CrossSellDismissReason } from "@eigyo/core";
import { db } from "@/lib/db";
import { fail, idOf, ok } from "../../../../_util";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** 横展開候補を「提案済み」または「不要」にして一覧から消す。 */
export async function POST(req: Request, ctx: Ctx) {
  try {
    const customerId = idOf(await ctx.params);
    const b = (await req.json()) as { product_id: number; reason?: CrossSellDismissReason; note?: string };
    const d = db();
    if (!Number.isInteger(b.product_id) || !getProduct(d, b.product_id)) return fail(new Error("商品が見つかりません"), 400);
    const reason: CrossSellDismissReason = b.reason === "not_needed" ? "not_needed" : "proposed";
    dismissCrossSell(d, customerId, b.product_id, reason, (b.note ?? "").slice(0, 200));
    return ok(crossSellCandidates(d, customerId));
  } catch (e) { return fail(e); }
}

/** 消した候補を戻す。 */
export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const customerId = idOf(await ctx.params);
    const b = (await req.json()) as { product_id: number };
    const d = db();
    undismissCrossSell(d, customerId, Number(b.product_id));
    return ok(crossSellCandidates(d, customerId));
  } catch (e) { return fail(e); }
}
