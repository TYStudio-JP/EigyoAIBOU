import { deliveryNotice, getQuote, getSettings, recordSupplierDelivery } from "@eigyo/core";
import { db } from "@/lib/db";
import { fail, idOf, ok } from "../../../_util";
export const dynamic = "force-dynamic";
/** 仕入れ先の納期回答を記録。GET は得意先向け連絡文。 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try { const id = idOf(await ctx.params); const b = (await req.json()) as { item_id: number; supplier_delivery: string | null; note?: string }; return ok(recordSupplierDelivery(db(), id, b.item_id, b.supplier_delivery, b.note)); } catch (e) { return fail(e); }
}
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try { const id = idOf(await ctx.params); const d = db(); const q = getQuote(d, id); if (!q) return fail(new Error("not found"), 404); const s = getSettings(d); return ok(deliveryNotice(q, s.company_name, s.sales_rep)); } catch (e) { return fail(e); }
}
