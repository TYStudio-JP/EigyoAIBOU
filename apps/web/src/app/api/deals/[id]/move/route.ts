import { applyDealStatus, createDeal, getCall, getDeal, getQuote, refreshDealSummary, setCallDeal, setQuoteDeal } from "@eigyo/core";
import { db } from "@/lib/db";
import { fail, idOf, ok } from "../../../_util";
export const dynamic = "force-dynamic";
/** 見積り・通話を別の案件へ移す（"new" なら新規案件として分離）。紐づけを間違えた時の修正用。 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const fromId = idOf(await ctx.params);
    const b = (await req.json()) as { quote_id?: number; call_id?: number; to: number | "new"; title?: string };
    const d = db();
    let toId: number;
    if (b.to === "new") {
      const customerId = b.quote_id ? getQuote(d, b.quote_id)?.customer_id : getCall(d, b.call_id!)?.customer_id;
      if (!customerId) return fail(new Error("得意先が未設定です"), 400);
      toId = createDeal(d, { customer_id: customerId, title: b.title || "分離した案件" }).id;
    } else toId = b.to;
    if (b.quote_id) setQuoteDeal(d, b.quote_id, toId);
    if (b.call_id) setCallDeal(d, b.call_id, toId);
    applyDealStatus(d, fromId); applyDealStatus(d, toId);
    await refreshDealSummary(d, toId, { useAi: false });
    return ok({ from: getDeal(d, fromId), to: getDeal(d, toId) });
  } catch (e) { return fail(e); }
}
