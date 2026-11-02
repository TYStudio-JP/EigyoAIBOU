import { crossSellCandidates, draftCrossSellProposal, getSettings } from "@eigyo/core";
import { db } from "@/lib/db";
import { todayIso } from "@/lib/format";
import { fail, idOf, ok } from "../../../_util";
export const dynamic = "force-dynamic";
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const d = db();
    const r = crossSellCandidates(d, idOf(await ctx.params));
    return ok(await draftCrossSellProposal(r, getSettings(d), todayIso()));
  } catch (e) { return fail(e); }
}
