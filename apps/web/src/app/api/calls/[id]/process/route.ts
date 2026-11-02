import { composeCallConfirmation, executeCallRequests, getCall, getSettings, listQuotes, structureCallMemo, updateCall } from "@eigyo/core";
import { db } from "@/lib/db";
import { todayIso } from "@/lib/format";
import { fail, idOf, ok } from "../../../_util";

export const dynamic = "force-dynamic";

/** 電話メモ → 議事録・依頼の構造化（Claude）→ 依頼の実行（決定的ロジック）→ 確認メール（Claude）。 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const id = idOf(await ctx.params);
    const d = db();
    const body = (await req.json().catch(() => ({}))) as { memo?: string; customer_id?: number | null };
    if (body.memo !== undefined || body.customer_id !== undefined) updateCall(d, id, { ...(body.memo !== undefined ? { memo: body.memo } : {}), ...(body.customer_id !== undefined ? { customer_id: body.customer_id } : {}) });
    const call = getCall(d, id);
    if (!call) return fail(new Error("not found"), 404);
    if (!call.memo.trim()) return fail(new Error("電話メモが空です"), 400);
    const today = todayIso();
    const recent = call.customer ? listQuotes(d, { customerId: call.customer.id, limit: 6 }) : [];
    const minutes = await structureCallMemo({ memo: call.memo, customer: call.customer, recentQuotes: recent, today, started_at: call.started_at });
    const executed = executeCallRequests(d, call, minutes);
    const mail = await composeCallConfirmation(call, executed, getSettings(d), today);
    const saved = updateCall(d, id, { minutes_json: JSON.stringify(executed), mail_subject: mail.subject, mail_body: mail.body, status: "processed" });
    return ok(saved);
  } catch (e) { return fail(e); }
}
