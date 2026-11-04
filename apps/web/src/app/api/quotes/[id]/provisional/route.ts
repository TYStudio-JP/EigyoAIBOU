import { applyDealStatus, getQuote, getSettings, markProvisional, provisionalText, refreshDealSummary, PROVISIONAL_CHANNEL_LABEL, type ProvisionalChannel } from "@eigyo/core";
import { db } from "@/lib/db";
import { fail, idOf, ok } from "../../../_util";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
const CHANNELS = Object.keys(PROVISIONAL_CHANNEL_LABEL) as ProvisionalChannel[];

/** 暫定回答の文面（SMS・LINE・電話用）を返す。?channel=sms|line|phone|mail */
export async function GET(req: Request, ctx: Ctx) {
  try {
    const id = idOf(await ctx.params);
    const d = db();
    const q = getQuote(d, id);
    if (!q) return fail(new Error("not found"), 404);
    const ch = (new URL(req.url).searchParams.get("channel") ?? "sms") as ProvisionalChannel;
    const channel = CHANNELS.includes(ch) ? ch : "sms";
    return ok({ channel, text: provisionalText(q, getSettings(d), channel), pending: Boolean(q.provisional_at && !q.formal_sent_at) });
  } catch (e) { return fail(e); }
}

/** 暫定回答を記録する（下書きなら提出済へ。正式見積書は「未送付」として追跡）。 */
export async function POST(req: Request, ctx: Ctx) {
  try {
    const id = idOf(await ctx.params);
    const b = (await req.json().catch(() => ({}))) as { channel?: ProvisionalChannel; text?: string };
    if (!b.channel || !CHANNELS.includes(b.channel)) return fail(new Error("回答した手段（電話・SMS・LINE・メール）を選んでください"), 400);
    const d = db();
    if (!getQuote(d, id)) return fail(new Error("not found"), 404);
    const q = markProvisional(d, id, { channel: b.channel, text: b.text });
    if (q.deal_id) { applyDealStatus(d, q.deal_id); await refreshDealSummary(d, q.deal_id, { useAi: false }); }
    return ok(q);
  } catch (e) { return fail(e); }
}
