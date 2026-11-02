import { getQuote, getSettings, quoteToExcel } from "@eigyo/core";
import { db } from "@/lib/db";
import { fail, idOf } from "../../../_util";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const id = idOf(await ctx.params);
    const d = db();
    const q = getQuote(d, id);
    if (!q) return fail(new Error("not found"), 404);
    const buf = await quoteToExcel(q, getSettings(d));
    const fname = encodeURIComponent(`見積書_${q.quote_no}_${q.customer.short_name}.xlsx`);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${fname}`,
      },
    });
  } catch (e) { return fail(e); }
}
