import { applyDealStatus, refreshDealSummary, setQuoteStatus, type LostReason, type QuoteStatus } from "@eigyo/core";
import { db } from "@/lib/db";
import { fail, idOf, ok } from "../../../_util";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const id = idOf(await ctx.params);
    const b = (await req.json()) as { status: QuoteStatus; lost_reason?: LostReason; lost_detail?: string; note?: string };
    const d = db();
    const q = setQuoteStatus(d, id, b.status, b);
    if (q.deal_id) { applyDealStatus(d, q.deal_id); await refreshDealSummary(d, q.deal_id, { useAi: false }); }
    return ok(q);
  } catch (e) { return fail(e); }
}
