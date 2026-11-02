import { getCall, updateCall } from "@eigyo/core";
import { db } from "@/lib/db";
import { fail, idOf, ok } from "../../../_util";

export const dynamic = "force-dynamic";

/** 確認メールの編集保存／送付済み記録。 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const id = idOf(await ctx.params);
    const b = (await req.json()) as { subject?: string; body?: string; sent?: boolean };
    const d = db();
    if (!getCall(d, id)) return fail(new Error("not found"), 404);
    return ok(updateCall(d, id, { ...(b.subject !== undefined ? { mail_subject: b.subject } : {}), ...(b.body !== undefined ? { mail_body: b.body } : {}), ...(b.sent ? { status: "sent" as const } : {}) }));
  } catch (e) { return fail(e); }
}
