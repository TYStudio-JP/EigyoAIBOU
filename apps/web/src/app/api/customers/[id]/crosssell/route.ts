import { crossSellCandidates } from "@eigyo/core";
import { db } from "@/lib/db";
import { fail, idOf, ok } from "../../../_util";
export const dynamic = "force-dynamic";
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try { return ok(crossSellCandidates(db(), idOf(await ctx.params))); } catch (e) { return fail(e); }
}
