import { getQuote, replaceItems, addActivity } from "@eigyo/core";
import { db } from "@/lib/db";
import { fail, idOf, ok } from "../../../_util";

export const dynamic = "force-dynamic";

/** 明細を丸ごと置き換える。 */
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const id = idOf(await ctx.params);
    const b = (await req.json()) as { items: Parameters<typeof replaceItems>[2]; note?: string };
    const d = db();
    replaceItems(d, id, b.items);
    addActivity(d, id, "note", b.note ?? "明細を更新");
    return ok(getQuote(d, id));
  } catch (e) { return fail(e); }
}
