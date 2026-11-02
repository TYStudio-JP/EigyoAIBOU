import { getCustomer, handoverCustomer, handoverFacts, hasApiKey, writeHandover } from "@eigyo/core";
import { db } from "@/lib/db";
import { todayIso } from "@/lib/format";
import { fail, idOf, ok } from "../../../_util";
export const dynamic = "force-dynamic";
/** 得意先の担当を別ユーザーへ引き継ぐ。引継ぎ書（AI 整形 or 事実のみ）を履歴に保存。 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const id = idOf(await ctx.params);
    const b = (await req.json()) as { to_user_id: number; note?: string; use_ai?: boolean };
    const d = db();
    if (!getCustomer(d, id)) return fail(new Error("not found"), 404);
    const facts = handoverFacts(d, id);
    const doc = b.use_ai && hasApiKey() ? await writeHandover(facts, todayIso()) : facts;
    return ok(handoverCustomer(d, id, b.to_user_id, { note: b.note, handover_doc: doc }));
  } catch (e) { return fail(e); }
}
