import { deleteCall, getCall, updateCall } from "@eigyo/core";
import { db } from "@/lib/db";
import { fail, idOf, ok } from "../../_util";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try { const c = getCall(db(), idOf(await ctx.params)); return c ? ok(c) : fail(new Error("not found"), 404); } catch (e) { return fail(e); }
}
export async function PATCH(req: Request, ctx: Ctx) {
  try { return ok(updateCall(db(), idOf(await ctx.params), await req.json())); } catch (e) { return fail(e); }
}
export async function DELETE(_req: Request, ctx: Ctx) {
  try { deleteCall(db(), idOf(await ctx.params)); return ok({ ok: true }); } catch (e) { return fail(e); }
}
