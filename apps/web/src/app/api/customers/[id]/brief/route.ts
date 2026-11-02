import { visitBrief, writeVisitBrief } from "@eigyo/core";
import { db } from "@/lib/db";
import { todayIso } from "@/lib/format";
import { fail, idOf, ok } from "../../../_util";
export const dynamic = "force-dynamic";
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try { const id = idOf(await ctx.params); return ok(await writeVisitBrief(visitBrief(db(), id), todayIso())); } catch (e) { return fail(e); }
}
