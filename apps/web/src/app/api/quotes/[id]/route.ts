import { applyDealStatus, deleteQuote, getQuote, listActivities, refreshDealSummary, setQuoteDeal, updateQuoteHeader } from "@eigyo/core";
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
    const b = (await req.json()) as Record<string, unknown> & { deal_id?: number | null };
    const d = db();
    const { deal_id, ...rest } = b;
    const before = getQuote(d, id);
    updateQuoteHeader(d, id, rest);
    if (deal_id !== undefined && before) {
      setQuoteDeal(d, id, deal_id ?? null);
      if (before.deal_id) { applyDealStatus(d, before.deal_id); await refreshDealSummary(d, before.deal_id, { useAi: false }); }
      if (deal_id) { applyDealStatus(d, deal_id); await refreshDealSummary(d, deal_id, { useAi: false }); }
    }
    return ok(getQuote(d, id));
  } catch (e) { return fail(e); }
}
export async function DELETE(_req: Request, ctx: Ctx) {
  try { deleteQuote(db(), idOf(await ctx.params)); return ok({ ok: true }); } catch (e) { return fail(e); }
}
