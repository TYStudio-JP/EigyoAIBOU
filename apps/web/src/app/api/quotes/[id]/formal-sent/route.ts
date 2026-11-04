import { formalDiff, getQuote, markFormalSent } from "@eigyo/core";
import { db } from "@/lib/db";
import { fail, idOf, ok } from "../../../_util";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** 暫定回答した内容と今の明細の差異（正式見積書を送る前の確認）。 */
export async function GET(_req: Request, ctx: Ctx) {
  try {
    const q = getQuote(db(), idOf(await ctx.params));
    if (!q) return fail(new Error("not found"), 404);
    return ok({ pending: Boolean(q.provisional_at && !q.formal_sent_at), provisional_at: q.provisional_at, channel: q.provisional_channel, diff: formalDiff(q) });
  } catch (e) { return fail(e); }
}

/** 正式見積書を送付済みにする。 */
export async function POST(req: Request, ctx: Ctx) {
  try {
    const id = idOf(await ctx.params);
    const b = (await req.json().catch(() => ({}))) as { note?: string };
    const d = db();
    if (!getQuote(d, id)) return fail(new Error("not found"), 404);
    return ok(markFormalSent(d, id, { note: b.note }));
  } catch (e) { return fail(e); }
}
