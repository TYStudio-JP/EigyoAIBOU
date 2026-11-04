import { after } from "next/server";
import { getCall, processCall, requestCallCancel, runCallProcess, startCallProcess, updateCall } from "@eigyo/core";
import { db } from "@/lib/db";
import { todayIso } from "@/lib/format";
import { fail, idOf, ok } from "../../../_util";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/**
 * 電話メモ → 議事録・回答・確認メール。既定は裏で動かし、すぐ `{ process_state: "running" }` を返す
 * （画面は GET /api/calls/[id] で様子を見る）。`wait: true` なら終わるまで待って結果を返す。
 */
export async function POST(req: Request, ctx: Ctx) {
  try {
    const id = idOf(await ctx.params);
    const d = db();
    const body = (await req.json().catch(() => ({}))) as { memo?: string; customer_id?: number | null; contact_id?: number | null; wait?: boolean };
    if (body.memo !== undefined || body.customer_id !== undefined || body.contact_id !== undefined) updateCall(d, id, { ...(body.memo !== undefined ? { memo: body.memo } : {}), ...(body.customer_id !== undefined ? { customer_id: body.customer_id } : {}), ...(body.contact_id !== undefined ? { contact_id: body.contact_id } : {}) });
    const call = getCall(d, id);
    if (!call) return fail(new Error("not found"), 404);
    if (!call.memo.trim()) return fail(new Error("電話メモが空です"), 400);
    if (body.wait) {
      const r = await processCall(d, id, { today: todayIso() });
      return ok({ ...r.call, link: r.link ? { deal_id: r.link.deal.id, title: r.link.deal.title, created: r.link.created, confidence: r.link.confidence } : null });
    }
    if (startCallProcess(d, id)) after(() => runCallProcess(d, id));
    return ok({ id, process_state: "running" });
  } catch (e) { return fail(e); }
}

/** キャンセル要求。議事録の構造化が終わった時点で止まる。 */
export async function DELETE(_req: Request, ctx: Ctx) {
  try { requestCallCancel(db(), idOf(await ctx.params)); return ok({ ok: true }); } catch (e) { return fail(e); }
}
