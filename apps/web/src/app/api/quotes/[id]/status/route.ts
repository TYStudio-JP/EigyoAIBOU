import { setQuoteStatus, type LostReason, type QuoteStatus } from "@eigyo/core";
import { db } from "@/lib/db";
import { fail, idOf, ok } from "../../../_util";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const id = idOf(await ctx.params);
    const b = (await req.json()) as { status: QuoteStatus; lost_reason?: LostReason; lost_detail?: string; note?: string };
    return ok(setQuoteStatus(db(), id, b.status, b));
  } catch (e) { return fail(e); }
}
