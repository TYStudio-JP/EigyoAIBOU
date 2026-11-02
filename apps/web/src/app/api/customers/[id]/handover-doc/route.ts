import { handoverFacts, writeHandover } from "@eigyo/core";
import { db } from "@/lib/db";
import { todayIso } from "@/lib/format";
import { fail, idOf, ok } from "../../../_util";
export const dynamic = "force-dynamic";
/** 引継ぎ書を AI で読みやすく整える（引継ぎ実行はしない）。 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try { const id = idOf(await ctx.params); return ok({ markdown: await writeHandover(handoverFacts(db(), id), todayIso()) }); } catch (e) { return fail(e); }
}
