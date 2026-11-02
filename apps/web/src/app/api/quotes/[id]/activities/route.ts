import { addActivity, getQuote, listActivities, setQuoteStatus } from "@eigyo/core";
import { db } from "@/lib/db";
import { fail, idOf, ok } from "../../../_util";

export const dynamic = "force-dynamic";

/** フォロー記録・メモを追加。followup を記録したら提出済→追跡中へ自動遷移。 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const id = idOf(await ctx.params);
    const b = (await req.json()) as { kind: "followup" | "note" | "ai"; body: string };
    const d = db();
    const a = addActivity(d, id, b.kind, b.body);
    const q = getQuote(d, id);
    if (b.kind === "followup" && q?.status === "submitted") setQuoteStatus(d, id, "tracking", { note: "フォロー記録により自動遷移" });
    return ok({ activity: a, activities: listActivities(d, id), quote: getQuote(d, id) });
  } catch (e) { return fail(e); }
}
