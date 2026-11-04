import { getSupplier, updateSupplier } from "@eigyo/core";
import { db } from "@/lib/db";
import { fail, idOf, ok } from "../../_util";

export const dynamic = "force-dynamic";

/** 仕入れ先の標準掛率・リードタイムを更新する（デスクトップの設定）。 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const id = idOf(await ctx.params);
    const d = db();
    if (!getSupplier(d, id)) return fail(new Error("仕入れ先が見つかりません"), 404);
    const b = (await req.json()) as { markup_rate?: number | null; lead_time_days?: number; contact_email?: string | null };
    const patch: typeof b = {};
    if (b.markup_rate !== undefined) {
      if (b.markup_rate !== null && !(Number(b.markup_rate) > 0 && Number(b.markup_rate) < 10)) return fail(new Error("掛率は 0 より大きく 10 未満で指定してください"), 400);
      patch.markup_rate = b.markup_rate === null ? null : Number(b.markup_rate);
    }
    if (b.lead_time_days !== undefined) patch.lead_time_days = Math.max(0, Math.round(Number(b.lead_time_days)));
    if (b.contact_email !== undefined) patch.contact_email = b.contact_email;
    return ok(updateSupplier(d, id, patch));
  } catch (e) { return fail(e); }
}
