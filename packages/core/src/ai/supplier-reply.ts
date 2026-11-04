import { z } from "zod";
import { betaZodOutputFormat as zodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { AiUnavailableError, FALLBACK_BETAS, MODEL, SYSTEM_BASE, getClient, hasApiKey } from "./client";
import type { SupplierReplyFields } from "../domain/supplier-quote";

const Schema = z.object({
  unit_price: z.number().nullable().describe("税抜の仕入れ単価（円）。複数あれば依頼した数量に対応するもの"),
  delivery: z.string().nullable().describe("納品・出荷できる日 YYYY-MM-DD。『○日後』『○営業日』なら lead_time_days に"),
  lead_time_days: z.number().int().nullable(),
  valid_until: z.string().nullable().describe("見積り有効期限 YYYY-MM-DD"),
  min_lot: z.number().int().nullable().describe("最小ロット・最低数量"),
  note: z.string().nullable().describe("条件・注意（送料別、在庫限り、代替品の提案など）を 1 文"),
});

/** メーカー・仕入れ先の回答メールから単価・納期・有効期限・最小ロットを構造化する。数字を作らせない。 */
export async function extractSupplierReply(text: string, today: string, context?: string): Promise<SupplierReplyFields> {
  if (!hasApiKey()) throw new AiUnavailableError();
  const res = await getClient().beta.messages.parse({
    model: MODEL, max_tokens: 1200, betas: [...FALLBACK_BETAS], fallbacks: "default",
    system: [{ type: "text", text: SYSTEM_BASE + "\n\nいまの役割: 仕入れ先からの回答メールの読み取り。書いてある数字だけを拾い、無いものは null。日付は本日を基準に YYYY-MM-DD に正規化する。", cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `本日: ${today}\n${context ? `依頼していた内容: ${context}\n` : ""}\n--- 回答メール ---\n${text.slice(0, 6000)}` }],
    output_config: { format: zodOutputFormat(Schema), effort: "low" },
  });
  if (!res.parsed_output) throw new Error("AI の応答を解析できませんでした");
  return res.parsed_output;
}
