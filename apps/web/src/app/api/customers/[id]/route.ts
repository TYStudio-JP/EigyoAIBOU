import { getCustomer, updateCustomer, type Customer } from "@eigyo/core";
import { db } from "@/lib/db";
import { fail, idOf, ok } from "../../_util";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const c = getCustomer(db(), idOf(await ctx.params));
    if (!c) return fail(new Error("得意先が見つかりません"), 404);
    return ok(c);
  } catch (e) { return fail(e); }
}

/** 得意先の値付けルール（掛率／粗利／端数）やメモを更新する（デスクトップの設定）。 */
export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const id = idOf(await ctx.params);
    const b = (await req.json()) as Partial<Pick<Customer, "pricing_mode" | "markup_rate" | "margin_pct" | "rounding_unit" | "notes" | "contact_name" | "contact_email" | "tel">>;
    const patch: typeof b = {};
    if (b.pricing_mode !== undefined) {
      if (!["none", "markup", "margin"].includes(b.pricing_mode)) return fail(new Error("pricing_mode が不正です"), 400);
      patch.pricing_mode = b.pricing_mode;
    }
    if (b.markup_rate !== undefined) {
      if (b.markup_rate !== null && !(Number(b.markup_rate) > 0 && Number(b.markup_rate) < 10)) return fail(new Error("掛率は 0 より大きく 10 未満で指定してください"), 400);
      patch.markup_rate = b.markup_rate === null ? null : Number(b.markup_rate);
    }
    if (b.margin_pct !== undefined) {
      if (b.margin_pct !== null && !(Number(b.margin_pct) > 0 && Number(b.margin_pct) < 100)) return fail(new Error("粗利率は 0〜100 の間で指定してください"), 400);
      patch.margin_pct = b.margin_pct === null ? null : Number(b.margin_pct);
    }
    if (b.rounding_unit !== undefined) {
      if (![1, 10, 100].includes(Number(b.rounding_unit))) return fail(new Error("端数単位は 1・10・100 のいずれかです"), 400);
      patch.rounding_unit = Number(b.rounding_unit);
    }
    if (typeof b.notes === "string") patch.notes = b.notes;
    for (const k of ["contact_name", "contact_email", "tel"] as const) if (b[k] !== undefined) patch[k] = b[k] === null ? null : String(b[k]);
    return ok(updateCustomer(db(), id, patch));
  } catch (e) { return fail(e); }
}
