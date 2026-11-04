import { z } from "zod";
import { betaZodOutputFormat as zodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { AiUnavailableError, FALLBACK_BETAS, MODEL, SYSTEM_BASE, getClient, hasApiKey } from "./client";

const Schema = z.object({
  maker: z.string().nullable().describe("メーカー名・ブランド（ラベルに書いてあるもの）"),
  part_number: z.string().nullable().describe("品番・型番（最も型番らしい文字列）"),
  name: z.string().nullable().describe("商品名・品名（分かれば一般名称でも可）"),
  spec: z.string().nullable().describe("サイズ・規格・容量・材質など、読み取れた仕様"),
  category_guess: z.string().nullable().describe("商品区分の推定（切削工具、安全保護具、梱包資材、ケミカル、電設資材 など）"),
  visible_text: z.array(z.string()).max(12).describe("ラベル・刻印から読めた文字列（原文のまま）"),
  confidence: z.enum(["high", "medium", "low"]),
});
export type ProductPhotoReading = z.infer<typeof Schema>;

/** 工場で撮った現行品・ラベル・刻印の写真から、メーカー・品番・品名・仕様を読み取る。 */
export async function readProductPhoto(image: { media_type: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; base64: string }, hint?: string): Promise<ProductPhotoReading> {
  if (!hasApiKey()) throw new AiUnavailableError();
  const res = await getClient().beta.messages.parse({
    model: MODEL, max_tokens: 1200, betas: [...FALLBACK_BETAS], fallbacks: "default",
    system: [{ type: "text", text: SYSTEM_BASE + "\n\nいまの役割: 商品写真の読み取り。写っている文字と形状から分かることだけを書く。推測は confidence を下げ、読めない項目は null。", cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: image.media_type, data: image.base64 } },
      { type: "text", text: `この商品の写真からメーカー・品番・品名・仕様を読み取ってください。${hint ? `補足: ${hint}` : ""}` },
    ] }],
    output_config: { format: zodOutputFormat(Schema), effort: "low" },
  });
  if (!res.parsed_output) throw new Error("AI の応答を解析できませんでした");
  return res.parsed_output;
}
