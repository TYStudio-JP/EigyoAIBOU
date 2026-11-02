import { z } from "zod";
import { betaZodOutputFormat as zodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { AiUnavailableError, FALLBACK_BETAS, MODEL, SYSTEM_BASE, getClient, hasApiKey } from "./client";

export const BusinessCardSchema = z.object({
  company: z.string().nullable().describe("会社名（株式会社などを含む正式名）"),
  name: z.string().nullable().describe("氏名（姓 名 の間に半角スペース）"),
  name_kana: z.string().nullable(),
  department: z.string().nullable(),
  title: z.string().nullable().describe("役職"),
  tel: z.string().nullable().describe("代表・部署の固定電話"),
  mobile: z.string().nullable().describe("携帯電話"),
  email: z.string().nullable(),
  address: z.string().nullable(),
  notes: z.string().nullable().describe("裏面のメモや手書きの情報など"),
});
export type BusinessCard = z.infer<typeof BusinessCardSchema>;

/** 名刺の写真（スマホで撮影）から担当者情報を読み取る。 */
export async function extractBusinessCard(image: { media_type: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; base64: string }, knownCustomers: string[]): Promise<BusinessCard> {
  if (!hasApiKey()) throw new AiUnavailableError();
  const res = await getClient().beta.messages.parse({
    model: MODEL,
    max_tokens: 1500,
    betas: [...FALLBACK_BETAS],
    fallbacks: "default",
    system: [{ type: "text", text: SYSTEM_BASE + "\n\nいまの役割: 名刺画像の読み取り。読めない項目は null。電話番号はハイフン区切りに正規化する。", cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: image.media_type, data: image.base64 } },
      { type: "text", text: `この名刺を読み取ってください。登録済みの得意先（会社名の表記合わせに使う）: ${knownCustomers.join("、")}` },
    ] }],
    output_config: { format: zodOutputFormat(BusinessCardSchema), effort: "low" },
  });
  if (res.stop_reason === "refusal") throw new Error("AI が応答を拒否しました");
  if (!res.parsed_output) throw new Error("名刺を読み取れませんでした");
  return res.parsed_output;
}
