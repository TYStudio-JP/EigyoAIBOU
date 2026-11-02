import { buildKeijo, getSettings, keijoToExcel } from "@eigyo/core";
import { db } from "@/lib/db";
import { fail, idOf } from "../../../_util";
export const dynamic = "force-dynamic";
/** 伝票計上指示の Excel。 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const id = idOf(await ctx.params); const d = db(); const s = getSettings(d);
    const sheet = buildKeijo(d, id, s);
    const buf = await keijoToExcel(sheet, s);
    const fname = encodeURIComponent(`計上指示_${sheet.quote.quote_no}_${sheet.quote.customer.short_name}.xlsx`);
    return new Response(new Uint8Array(buf), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename*=UTF-8''${fname}` } });
  } catch (e) { return fail(e); }
}
