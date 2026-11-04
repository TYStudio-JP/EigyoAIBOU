import { draftInquiryAnswer, getSettings, hasApiKey, inquiryFacts, researchWeb, type ResearchResult } from "@eigyo/core";
import { db } from "@/lib/db";
import { todayIso } from "@/lib/format";
import { fail, idOf, ok } from "../../../_util";

export const dynamic = "force-dynamic";

/**
 * 回答文の下書き。{ use_web: true } で Claude のウェブ検索（仕様・規格・同等品）も材料に加える。
 * AI 未接続なら社内記録だけの決定的な文面を返す。
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const id = idOf(await ctx.params);
    const d = db();
    const facts = inquiryFacts(d, id);
    const b = (await req.json().catch(() => ({}))) as { use_web?: boolean };
    const today = todayIso();
    if (!hasApiKey()) return ok({ ai_used: false, web: null, draft: { short_reply: facts.deterministic_answer, mail_subject: `お問い合わせの件：${facts.inquiry.question.slice(0, 30)}`, mail_body: facts.deterministic_answer, confidence: facts.products.length ? "medium" : "low", open_points: facts.open_points, next_action: facts.open_points[0] ?? "回答を送る" } });
    let web: ResearchResult | null = null;
    if (b.use_web) {
      const p = facts.products[0];
      const query = p ? `${p.product.maker} ${p.product.part_number} ${p.product.name} ${facts.inquiry.kind === "equivalent" ? "同等品 後継品" : facts.inquiry.kind === "spec" ? "仕様 規格" : ""}` : facts.inquiry.question.slice(0, 120);
      web = await researchWeb(query, `得意先からの問い合わせ: ${facts.inquiry.question.slice(0, 300)}`, today, facts.inquiry.kind === "equivalent" ? "equivalent" : facts.inquiry.kind === "spec" ? "spec" : "general");
    }
    const draft = await draftInquiryAnswer(facts, getSettings(d), today, web);
    return ok({ ai_used: true, web, draft });
  } catch (e) { return fail(e); }
}
