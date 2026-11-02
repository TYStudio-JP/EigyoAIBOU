import { getContact, updateContact } from "@eigyo/core";
import { db } from "@/lib/db";
import { fail, idOf, ok } from "../../_util";
export const dynamic = "force-dynamic";
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try { const id = idOf(await ctx.params); const d = db(); if (!getContact(d, id)) return fail(new Error("not found"), 404); return ok(updateContact(d, id, await req.json())); } catch (e) { return fail(e); }
}
