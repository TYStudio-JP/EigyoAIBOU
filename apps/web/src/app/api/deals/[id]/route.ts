import { addDealEvent, applyDealStatus, dealTimeline, getDeal, updateDeal } from "@eigyo/core";
import { db } from "@/lib/db";
import { fail, idOf, ok } from "../../_util";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
export async function GET(_req: Request, ctx: Ctx) {
  try { const d = db(); const id = idOf(await ctx.params); const deal = getDeal(d, id); return deal ? ok({ ...deal, timeline: dealTimeline(d, id) }) : fail(new Error("not found"), 404); } catch (e) { return fail(e); }
}
export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const id = idOf(await ctx.params);
    const b = (await req.json()) as { title?: string; contact_id?: number | null; end_customer_id?: number | null; next_action?: string; next_action_due?: string | null; note?: string; status?: "won" | "lost" | null };
    const d = db();
    const { note, status, ...patch } = b;
    updateDeal(d, id, patch);
    if (note) addDealEvent(d, id, "note", note);
    if (status) { updateDeal(d, id, { status, closed_at: new Date().toISOString().slice(0, 10) }); addDealEvent(d, id, "status", `手動で ${status === "won" ? "受注" : "失注"} に変更`); }
    else applyDealStatus(d, id);
    return ok(getDeal(d, id));
  } catch (e) { return fail(e); }
}
