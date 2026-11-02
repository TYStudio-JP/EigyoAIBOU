import { refreshDealSummary } from "@eigyo/core";
import { db } from "@/lib/db";
import { fail, idOf, ok } from "../../../_util";
export const dynamic = "force-dynamic";
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try { return ok(await refreshDealSummary(db(), idOf(await ctx.params))); } catch (e) { return fail(e); }
}
