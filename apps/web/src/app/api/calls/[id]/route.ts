import { applyDealStatus, deleteCall, getCall, refreshDealSummary, setCallDeal, updateCall } from "@eigyo/core";
import { db } from "@/lib/db";
import { fail, idOf, ok } from "../../_util";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try { const c = getCall(db(), idOf(await ctx.params)); return c ? ok(c) : fail(new Error("not found"), 404); } catch (e) { return fail(e); }
}
export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const id = idOf(await ctx.params);
    const d = db();
    const { deal_id, ...rest } = (await req.json()) as Record<string, unknown> & { deal_id?: number | null };
    const before = getCall(d, id);
    const c = updateCall(d, id, rest);
    if (deal_id !== undefined && before) {
      setCallDeal(d, id, deal_id ?? null);
      for (const did of [before.deal_id, deal_id]) if (did) { applyDealStatus(d, did); await refreshDealSummary(d, did, { useAi: false }); }
      return ok(getCall(d, id));
    }
    return ok(c);
  } catch (e) { return fail(e); }
}
export async function DELETE(_req: Request, ctx: Ctx) {
  try { deleteCall(db(), idOf(await ctx.params)); return ok({ ok: true }); } catch (e) { return fail(e); }
}
