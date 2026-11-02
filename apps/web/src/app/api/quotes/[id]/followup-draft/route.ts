import { addActivity, draftFollowup, getQuote, getSettings, listActivities } from "@eigyo/core";
import { db } from "@/lib/db";
import { todayIso } from "@/lib/format";
import { fail, idOf, ok } from "../../../_util";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const id = idOf(await ctx.params);
    const d = db();
    const q = getQuote(d, id);
    if (!q) return fail(new Error("not found"), 404);
    const draft = await draftFollowup(q, listActivities(d, id), getSettings(d), todayIso());
    addActivity(d, id, "ai", `フォロー文面を生成：${draft.next_action}`);
    return ok(draft);
  } catch (e) { return fail(e); }
}
