import { z } from "zod";
import { betaZodOutputFormat as zodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { AiUnavailableError, FALLBACK_BETAS, MODEL, SYSTEM_BASE, getClient, hasApiKey } from "./client";
import type { CallMinutes, CallWithCustomer, Customer, Settings } from "../domain/types";
import type { QuoteSummary } from "../domain/repo";

const RequestSchema = z.object({
  kind: z.enum(["product_inquiry", "price", "delivery", "quote_request", "quantity_change", "complaint", "other"]),
  detail: z.string().describe("相手の発言の要約（主語を明確に）"),
  product_query: z.string().nullable().describe("商品を特定する手がかり（品番・商品名・仕様）。無ければ null"),
  qty: z.number().nullable(),
  unit: z.string().nullable(),
  asked_price: z.number().nullable().describe("相手が口にした希望単価や競合価格（円）。無ければ null"),
  requested_delivery: z.string().nullable().describe("希望納期 YYYY-MM-DD。『来週中』『月末』などは本日基準で換算"),
  quote_no: z.string().nullable().describe("既存の見積番号（Q で始まる）への言及があれば"),
  items: z.array(z.object({ product_query: z.string(), qty: z.number() })).describe("kind が quote_request のときの明細。それ以外は空配列"),
});
export const CallMinutesSchema = z.object({
  summary: z.string().describe("議事録。日時・相手・話した内容を 3〜5 行の箇条書き（改行は \\n）"),
  counterpart: z.string().nullable().describe("相手の名前・役職"),
  requests: z.array(RequestSchema).describe("相手からの依頼・相談を 1 件ずつ"),
  promises: z.array(z.string()).describe("こちらが口頭で約束したこと（期限付きで）"),
  rep_todos: z.array(z.string()).describe("営業担当が人としてやるべきこと（訪問・上司確認・社内手配など）"),
  next_contact: z.string().nullable().describe("次回連絡の目安（日付または『先方から連絡』）"),
  mood: z.enum(["good", "neutral", "concerned"]).nullable().describe("相手の温度感"),
});

/** 電話メモ（喋った内容・書いた内容）を議事録と依頼事項に構造化する。 */
export async function structureCallMemo(params: { memo: string; customer: Customer | null; recentQuotes: QuoteSummary[]; today: string; started_at: string }): Promise<CallMinutes> {
  if (!hasApiKey()) throw new AiUnavailableError();
  const { memo, customer, recentQuotes, today, started_at } = params;
  const quotes = recentQuotes.slice(0, 6).map((q) => `  ${q.quote_no}（${q.status}）${q.subject} ${Math.round(q.total).toLocaleString()}円 提出 ${q.submitted_at ?? "未"}`).join("\n");
  const res = await getClient().beta.messages.parse({
    model: MODEL,
    max_tokens: 6000,
    betas: [...FALLBACK_BETAS],
    fallbacks: "default",
    system: [{ type: "text", text: SYSTEM_BASE + "\n\nいまの役割: 電話直後の口頭メモ（音声入力なので誤変換・言い直し・話し言葉を含む）を、議事録と依頼事項に整理する。口頭のミス・漏れを無くすのが目的なので、数量・価格・納期・品番は必ず拾う。曖昧なものは requests.detail に『要確認』と明記する。", cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `本日: ${today}　通話開始: ${started_at}
相手: ${customer ? `${customer.name}（${customer.industry}）担当 ${customer.contact_name ?? "不明"}。得意先メモ: ${customer.notes}` : "得意先未特定"}
この得意先の最近の見積り:
${quotes || "  なし"}

--- 電話メモ（音声入力） ---
${memo}
--- ここまで ---` }],
    output_config: { format: zodOutputFormat(CallMinutesSchema), effort: "medium" },
  });
  if (res.stop_reason === "refusal") throw new Error("AI が応答を拒否しました: " + (res.stop_details?.explanation ?? ""));
  if (!res.parsed_output) throw new Error("AI の応答を解析できませんでした");
  return res.parsed_output;
}

const MailSchema = z.object({ subject: z.string(), body: z.string().describe("宛名・本文・署名。改行は \\n") });

/** 依頼の実行結果を踏まえて、得意先宛ての確認メールを書く。 */
export async function composeCallConfirmation(call: CallWithCustomer, minutes: CallMinutes, settings: Settings, today: string): Promise<{ subject: string; body: string }> {
  if (!hasApiKey()) throw new AiUnavailableError();
  const c = call.customer;
  const reqs = minutes.requests.map((r, i) => `${i + 1}. [${r.kind}] ${r.detail}\n   → 結果: ${r.result ? `${r.result.headline}（${r.result.status === "needs_human" ? "担当確認中" : r.result.status}）${r.result.detail ? " / " + r.result.detail : ""}` : "未処理"}`).join("\n");
  const res = await getClient().beta.messages.parse({
    model: MODEL,
    max_tokens: 3000,
    betas: [...FALLBACK_BETAS],
    fallbacks: "default",
    system: [{ type: "text", text: SYSTEM_BASE + "\n\nいまの役割: 電話の内容を得意先に書面で確認するメール。『お電話の件、以下の通り承りました』の形で、依頼ごとに結果（単価・納期・見積番号）を箇条書きにする。担当確認中の項目は回答予定を明記。数字は与えられたものだけを使い、作らない。200〜400 字。", cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `本日: ${today}　通話: ${call.started_at}
宛先: ${c ? `${c.name} ${c.contact_name ?? ""} 様` : "得意先"}（${minutes.counterpart ?? ""}）
自社: ${settings.company_name} ${settings.sales_rep}
議事録:
${minutes.summary}
依頼と結果:
${reqs}
こちらの約束: ${minutes.promises.join(" / ") || "なし"}
次回連絡: ${minutes.next_contact ?? "未定"}` }],
    output_config: { format: zodOutputFormat(MailSchema), effort: "low" },
  });
  if (!res.parsed_output) throw new Error("AI の応答を解析できませんでした");
  return res.parsed_output;
}
