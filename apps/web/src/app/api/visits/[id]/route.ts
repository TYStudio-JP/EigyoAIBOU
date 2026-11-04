import { deleteVisit, getVisit, updateVisit } from "@eigyo/core";
import { db } from "@/lib/db";
import { fail, idOf, ok } from "../../_util";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** 得意先の紐づけ直し・時刻やメモの修正。 */
export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const id = idOf(await ctx.params);
    const d = db();
    if (!getVisit(d, id)) return fail(new Error("not found"), 404);
    const b = (await req.json()) as { customer_id?: number | null; title?: string; starts_at?: string; ends_at?: string | null; place?: string; notes?: string };
    const patch: typeof b = {};
    if (b.customer_id !== undefined) patch.customer_id = b.customer_id === null ? null : Number(b.customer_id);
    if (typeof b.title === "string" && b.title.trim()) patch.title = b.title.trim();
    if (b.starts_at !== undefined) { if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(b.starts_at)) return fail(new Error("開始日時の形式が不正です"), 400); patch.starts_at = b.starts_at; }
    if (b.ends_at !== undefined) { if (b.ends_at && !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(b.ends_at)) return fail(new Error("終了日時の形式が不正です"), 400); patch.ends_at = b.ends_at || null; }
    if (typeof b.place === "string") patch.place = b.place;
    if (typeof b.notes === "string") patch.notes = b.notes;
    return ok(updateVisit(d, id, patch));
  } catch (e) { return fail(e); }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try { deleteVisit(db(), idOf(await ctx.params)); return ok({ ok: true }); } catch (e) { return fail(e); }
}
