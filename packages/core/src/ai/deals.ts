import { z } from "zod";
import { betaZodOutputFormat as zodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { AiUnavailableError, FALLBACK_BETAS, MODEL, SYSTEM_BASE, getClient, hasApiKey } from "./client";
import type { Adjudicator, TimelineItem } from "../domain/deals";
import type { DealWithRefs } from "../domain/types";
import { DEAL_STATUS_LABEL } from "../domain/types";

const LinkSchema = z.object({
  deal_id: z.number().nullable().describe("続きだと判断した案件の id。新規なら null"),
  confidence: z.enum(["high", "medium", "low"]),
  title: z.string().describe("新規案件のときの件名（得意先名は含めず、話の中身で 15 字以内。例: 第2ライン立ち上げ）。既存なら既存の件名"),
  reason: z.string().describe("判断理由を 1 文で"),
});

/** 新しい内容がどの案件の続きか、新規かを Claude に裁定させる。 */
export const adjudicateDealLink: Adjudicator = async ({ input, candidates }) => {
  if (!hasApiKey()) return null;
  const cands = candidates.map((c) => `- id=${c.deal.id} 「${c.deal.title}」状態:${DEAL_STATUS_LABEL[c.deal.status]} 最終:${c.deal.last_activity_at.slice(0, 10)} 機械採点:${c.score.toFixed(2)}（${c.reasons.join("、")}）\n  要約: ${c.deal.summary.replace(/\n/g, " ").slice(0, 160)}`).join("\n");
  const res = await getClient().beta.messages.parse({
    model: MODEL,
    max_tokens: 800,
    betas: [...FALLBACK_BETAS],
    fallbacks: "default",
    system: [{ type: "text", text: SYSTEM_BASE + "\n\nいまの役割: 新しく入ってきた内容（電話・メール・見積り）が、既存の案件（ひとつの話）の続きか、新しい話かを判定する。消耗品の繰り返し発注は同じ案件にまとめる。別のライン・別の工事・別の納入先の話なら新規。", cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `候補の案件:\n${cands || "（なし）"}\n\n新しい内容:\n${input.text.slice(0, 1500)}` }],
    output_config: { format: zodOutputFormat(LinkSchema), effort: "low" },
  });
  const out = res.parsed_output;
  if (!out) return null;
  if (out.deal_id && !candidates.some((c) => c.deal.id === out.deal_id)) return { ...out, deal_id: null };
  return out;
};

const SummarySchema = z.object({
  summary: z.string().describe("ここまでの経緯と今の状況を 3 行（改行区切り）。1 行目: 何の話か、2 行目: ここまでに何があったか、3 行目: 今どこで止まっているか"),
  summary_detail: z.string().describe("詳細。時系列で 5〜12 行。数字（単価・数量・納期・金額）は必ず入れる"),
  next_action: z.string().describe("次の一手（1 文、誰が何を）"),
  next_action_due: z.string().nullable().describe("期限 YYYY-MM-DD"),
  risk: z.string().nullable().describe("失注・遅延のリスクがあれば 1 文"),
});

/** 案件の「ここまでの経緯と今の状況」を書き直す。 */
export async function writeDealSummary(deal: DealWithRefs, timeline: TimelineItem[], today: string): Promise<z.infer<typeof SummarySchema>> {
  if (!hasApiKey()) throw new AiUnavailableError();
  const tl = timeline.slice(0, 25).reverse().map((t) => `${t.at.slice(0, 16)} [${t.title}] ${t.body}`).join("\n");
  const res = await getClient().beta.messages.parse({
    model: MODEL,
    max_tokens: 2500,
    betas: [...FALLBACK_BETAS],
    fallbacks: "default",
    system: [{ type: "text", text: SYSTEM_BASE + "\n\nいまの役割: 案件の経緯を、後任や上司が 30 秒で状況を掴めるように要約する。事実だけを書き、推測は『〜と思われる』と明示する。", cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `本日: ${today}\n案件: ${deal.customer.name}${deal.contact ? ` ${deal.contact.name}（${deal.contact.department} ${deal.contact.title}）` : ""}${deal.end_customer ? ` 納入先: ${deal.end_customer.name}` : ""}「${deal.title}」\n状態: ${DEAL_STATUS_LABEL[deal.status]}　見積り ${deal.quote_count} 件 / 通話 ${deal.call_count} 件 / 金額 ${Math.round(deal.amount).toLocaleString()}円\n得意先メモ: ${deal.customer.notes}\n\n時系列:\n${tl || "（まだ記録なし）"}` }],
    output_config: { format: zodOutputFormat(SummarySchema), effort: "low" },
  });
  if (!res.parsed_output) throw new Error("AI の応答を解析できませんでした");
  return res.parsed_output;
}
