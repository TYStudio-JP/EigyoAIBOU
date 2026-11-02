import { z } from "zod";
import { betaZodOutputFormat as zodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { AiUnavailableError, FALLBACK_BETAS, MODEL, SYSTEM_BASE, getClient, hasApiKey } from "./client";
import type { VisitBrief } from "../domain/brief";

const Schema = z.object({
  headline: z.string().describe("この訪問の目的を 1 文で"),
  talking_points: z.array(z.string()).max(6).describe("話す順に、各 1 文。根拠（案件・数字）を含める"),
  cautions: z.array(z.string()).max(4).describe("地雷・注意点（失注理由、担当者の性格、引継ぎ事項）"),
  ask: z.string().describe("持ち帰りたい情報を 1 文（例: 第2ラインの立ち上げ時期）"),
});
export type VisitBriefAi = z.infer<typeof Schema>;

/** 訪問前ブリーフの話題を、事実から 5 行にまとめる。 */
export async function writeVisitBrief(b: VisitBrief, today: string): Promise<VisitBriefAi> {
  if (!hasApiKey()) throw new AiUnavailableError();
  const facts = JSON.stringify({ customer: { name: b.customer?.name, industry: b.customer?.industry, notes: b.customer?.notes }, contacts: b.contacts, open_deals: b.open_deals, recent_calls: b.recent_calls, waiting_quotes: b.waiting_quotes, recent_lost: b.recent_lost, staples: b.staples, cross_sell: b.cross_sell, handover_notes: b.handover_notes }, null, 1);
  const res = await getClient().beta.messages.parse({
    model: MODEL, max_tokens: 2000, betas: [...FALLBACK_BETAS], fallbacks: "default",
    system: [{ type: "text", text: SYSTEM_BASE + "\n\nいまの役割: 訪問直前に営業担当が車の中で 30 秒で読むブリーフ。事実から優先順位を付け、話す順番に並べる。他社の社名は『同業のお客様』と言い換える。", cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `本日: ${today}\n\n${facts}` }],
    output_config: { format: zodOutputFormat(Schema), effort: "low" },
  });
  if (!res.parsed_output) throw new Error("AI の応答を解析できませんでした");
  return res.parsed_output;
}
