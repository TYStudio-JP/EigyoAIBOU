import { answerInquiry, deleteInquiry, getInquiry, inquiryFacts, updateInquiry, INQUIRY_CHANNEL_LABEL, INQUIRY_KIND_LABEL, type InquiryChannel, type InquiryKind } from "@eigyo/core";
import { db } from "@/lib/db";
import { fail, idOf, ok } from "../../_util";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** 問い合わせと、社内記録から集めた回答材料。 */
export async function GET(_req: Request, ctx: Ctx) {
  try { return ok(inquiryFacts(db(), idOf(await ctx.params))); } catch (e) { return fail(e); }
}

/** 得意先・種類の修正、回答の記録（answer と answer_channel を渡すと回答済みになる）。 */
export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const id = idOf(await ctx.params);
    const d = db();
    if (!getInquiry(d, id)) return fail(new Error("not found"), 404);
    const b = (await req.json()) as { customer_id?: number | null; kind?: InquiryKind; channel?: InquiryChannel; question?: string; due?: string | null; answer?: string; answer_channel?: InquiryChannel; status?: "open" | "answered" | "closed" };
    if (b.answer !== undefined) {
      if (!b.answer.trim()) return fail(new Error("回答文が空です"), 400);
      const ch = b.answer_channel && b.answer_channel in INQUIRY_CHANNEL_LABEL ? b.answer_channel : "mail";
      return ok(answerInquiry(d, id, b.answer, ch, { close: b.status !== "open" }));
    }
    const patch: Parameters<typeof updateInquiry>[2] = {};
    if (b.customer_id !== undefined) patch.customer_id = b.customer_id === null ? null : Number(b.customer_id);
    if (b.kind && b.kind in INQUIRY_KIND_LABEL) patch.kind = b.kind;
    if (b.channel && b.channel in INQUIRY_CHANNEL_LABEL) patch.channel = b.channel;
    if (typeof b.question === "string" && b.question.trim()) patch.question = b.question.trim();
    if (b.due !== undefined) { if (b.due && !/^\d{4}-\d{2}-\d{2}$/.test(b.due)) return fail(new Error("期限は YYYY-MM-DD で指定してください"), 400); patch.due = b.due || null; }
    if (b.status === "open" || b.status === "answered" || b.status === "closed") patch.status = b.status;
    return ok(updateInquiry(d, id, patch));
  } catch (e) { return fail(e); }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try { deleteInquiry(db(), idOf(await ctx.params)); return ok({ ok: true }); } catch (e) { return fail(e); }
}
