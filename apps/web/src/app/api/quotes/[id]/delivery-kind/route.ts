import { getQuote, markDeliveryKind, type DeliveryKind } from "@eigyo/core";
import { db } from "@/lib/db";
import { fail, idOf, ok } from "../../../_util";

export const dynamic = "force-dynamic";

/** 回答納期を「概算（注文前）」「確定（注文後）」に切り替える。 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const id = idOf(await ctx.params);
    const b = (await req.json()) as { kind: DeliveryKind; note?: string };
    if (b.kind !== "estimate" && b.kind !== "confirmed") return fail(new Error("kind は estimate か confirmed です"), 400);
    const d = db();
    if (!getQuote(d, id)) return fail(new Error("not found"), 404);
    return ok(markDeliveryKind(d, id, b.kind, b.note));
  } catch (e) { return fail(e); }
}
