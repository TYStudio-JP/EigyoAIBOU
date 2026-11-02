import { z } from "zod";
import { betaZodOutputFormat as zodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type Anthropic from "@anthropic-ai/sdk";
import { AiUnavailableError, FALLBACK_BETAS, MODEL, SYSTEM_BASE, getClient, hasApiKey } from "./client";

export const ExtractedItemSchema = z.object({
  raw_text: z.string().describe("依頼文中の該当箇所をそのまま"),
  product_query: z.string().describe("商品マスタ検索に使う語。品番があれば品番、なければ商品名＋仕様（例: 耐切創手袋 レベル5 L）"),
  part_number: z.string().nullable().describe("品番が明記されていれば"),
  qty: z.number().describe("数量。不明なら 0"),
  unit: z.string().nullable().describe("単位（箱・本・個 など）。不明なら null"),
  is_new_for_customer: z.boolean().describe("「初めて」「新規」など、この得意先が初めて買う旨の記述があれば true"),
  note: z.string().nullable().describe("その明細に関する補足（仕様指定・代替可否など）"),
});

export const ExtractedRequestSchema = z.object({
  customer_hint: z.string().nullable().describe("得意先名・略称・担当者名など、得意先を特定できる語"),
  contact_name: z.string().nullable(),
  subject: z.string().describe("見積り件名として使える短い要約（例: 年末繁忙期向け 衛生・梱包資材）"),
  requested_delivery: z.string().nullable().describe("希望納期。YYYY-MM-DD 形式。『再来週』『来月5日』など相対表現は本日基準で換算。不明なら null"),
  delivery_note: z.string().nullable().describe("納期に関する原文・補足"),
  price_pressure: z.string().nullable().describe("値引き要求・競合情報など価格に関わる発言"),
  items: z.array(ExtractedItemSchema),
  open_questions: z.array(z.string()).describe("得意先に確認すべき不明点"),
});
export type ExtractedRequest = z.infer<typeof ExtractedRequestSchema>;

export interface ExtractInput {
  text?: string;
  /** 添付ファイル（PDF・画像）。Excel は事前にテキスト化して text に入れる。 */
  file?: { name: string; media_type: string; base64: string };
  today: string;
  /** 既知の得意先一覧（名寄せ用） */
  customerNames: string[];
}

/** メール・電話メモ・添付ファイルから見積り依頼を構造化する。 */
export async function extractQuoteRequest(input: ExtractInput): Promise<ExtractedRequest> {
  if (!hasApiKey()) throw new AiUnavailableError();
  const client = getClient();
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (input.file) {
    if (input.file.media_type === "application/pdf") {
      content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: input.file.base64 } });
    } else if (input.file.media_type.startsWith("image/")) {
      content.push({ type: "image", source: { type: "base64", media_type: input.file.media_type as "image/png" | "image/jpeg" | "image/gif" | "image/webp", data: input.file.base64 } });
    }
  }
  content.push({
    type: "text",
    text: `本日: ${input.today}
登録済み得意先（名寄せの参考）: ${input.customerNames.join("、")}

以下の見積り依頼から、明細・納期・不明点を抽出してください。
${input.file ? `添付ファイル名: ${input.file.name}\n` : ""}${input.text ? `--- 依頼文 ---\n${input.text}\n--- ここまで ---` : "依頼内容は添付ファイルを参照。"}`,
  });

  const res = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    betas: [...FALLBACK_BETAS],
    fallbacks: "default",
    system: [{ type: "text", text: SYSTEM_BASE + "\n\nいまの役割: 見積り依頼の構造化。商品名は依頼文の表記を尊重しつつ、検索しやすい語に整える。", cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content }],
    output_config: { format: zodOutputFormat(ExtractedRequestSchema), effort: "medium" },
  });
  if (res.stop_reason === "refusal") throw new Error("AI が応答を拒否しました: " + (res.stop_details?.explanation ?? ""));
  if (!res.parsed_output) throw new Error("AI の応答を解析できませんでした");
  return res.parsed_output;
}
