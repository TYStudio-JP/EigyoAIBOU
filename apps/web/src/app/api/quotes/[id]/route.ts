import { deleteQuote, getQuote, listActivities, updateQuoteHeader } from "@eigyo/core";
import { db } from "@/lib/db";
import { fail, idOf, ok } from "../../_util";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const id = idOf(await ctx.params);
    const d = db();
    const q = getQuote(d, id);
    if (!q) return fail(new Error("見積りが見つかりません"), 404);
    return ok({ ...q, activities: listActivities(d, id) });
  } catch (e) { return fail(e); }
}
export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const id = idOf(await ctx.params);
    const b = await req.json();
    updateQuoteHeader(db(), id, b);
    return ok(getQuote(db(), id));
  } catch (e) { return fail(e); }
}
export async function DELETE(_req: Request, ctx: Ctx) {
  try { deleteQuote(db(), idOf(await ctx.params)); return ok({ ok: true }); } catch (e) { return fail(e); }
}
