import { z } from "zod";
import { betaZodOutputFormat as zodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { AiUnavailableError, FALLBACK_BETAS, MODEL, SYSTEM_BASE, getClient, hasApiKey } from "./client";
import type { Activity, QuoteWithItems, Settings } from "../domain/types";
import { STATUS_LABEL } from "../domain/types";
import type { CrossSellResult } from "../domain/crosssell";
import type { PriceCheck } from "../domain/pricing";

const MailSchema = z.object({
  subject: z.string(),
  body: z.string().describe("メール本文。宛名・署名を含む。改行は \\n"),
  call_script: z.string().describe("電話でフォローする場合の 3 行程度の話し方"),
  next_action: z.string().describe("営業担当が次に取るべき一手（1 文）"),
});
export type FollowupDraft = z.infer<typeof MailSchema>;

function quoteSummary(q: QuoteWithItems, settings: Settings): string {
  const lines = q.items.map((it) => `  - ${it.description} × ${it.qty}${it.unit} @ ${it.unit_price.toLocaleString()}円`);
  return `見積番号: ${q.quote_no}（${STATUS_LABEL[q.status]}）
得意先: ${q.customer.name}（担当: ${q.customer.contact_name ?? "不明"}）業種: ${q.customer.industry}
件名: ${q.subject}
提出日: ${q.submitted_at ?? "未提出"} / 有効期限: ${q.valid_until ?? "-"} / 希望納期: ${q.requested_delivery ?? "-"} / 回答納期: ${q.promised_delivery ?? "-"}
合計: ${Math.round(q.total).toLocaleString()}円（税抜）
明細:
${lines.join("\n")}
得意先メモ: ${q.customer.notes}
自社: ${settings.company_name} ${settings.sales_rep}`;
}

/** 提出済み見積りのフォローアップ（メール＋電話トーク）を下書きする。 */
export async function draftFollowup(q: QuoteWithItems, activities: Activity[], settings: Settings, today: string): Promise<FollowupDraft> {
  if (!hasApiKey()) throw new AiUnavailableError();
  const history = activities.slice(0, 8).map((a) => `  ${a.created_at.slice(0, 10)} [${a.kind}] ${a.body}`).join("\n");
  const res = await getClient().beta.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    betas: [...FALLBACK_BETAS],
    fallbacks: "default",
    system: [{ type: "text", text: SYSTEM_BASE + "\n\nいまの役割: 提出済み見積りのフォローアップ文面作成。押し売りにならず、相手が返事をしやすい具体的な問いを 1 つ入れる。", cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `本日: ${today}\n\n${quoteSummary(q, settings)}\n\nこれまでの経緯:\n${history || "  （記録なし）"}\n\nこの案件のフォローアップメールと電話トークを作成してください。` }],
    output_config: { format: zodOutputFormat(MailSchema), effort: "medium" },
  });
  if (!res.parsed_output) throw new Error("AI の応答を解析できませんでした");
  return res.parsed_output;
}

const InquirySchema = z.object({
  to: z.string().describe("宛先の仕入れ先・メーカー名"),
  subject: z.string(),
  body: z.string(),
  checklist: z.array(z.string()).describe("回答をもらったら確認すべき項目"),
});
export type InquiryDraft = z.infer<typeof InquirySchema>;

/** 仕入れ先・メーカーへの問い合わせメール（納期・仕様・価格）を下書きする。 */
export async function draftSupplierInquiry(params: { supplier_name: string; product_desc: string; qty: number; unit: string; question: string; requested_delivery: string | null; settings: Settings; today: string }): Promise<InquiryDraft> {
  if (!hasApiKey()) throw new AiUnavailableError();
  const p = params;
  const res = await getClient().beta.messages.parse({
    model: MODEL,
    max_tokens: 3000,
    betas: [...FALLBACK_BETAS],
    fallbacks: "default",
    system: [{ type: "text", text: SYSTEM_BASE + "\n\nいまの役割: 仕入れ先・メーカーへの問い合わせメール作成。相手が即答できるよう、品番・数量・希望納期・回答期限を明記する。", cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `本日: ${p.today}\n宛先: ${p.supplier_name}\n自社: ${p.settings.company_name} ${p.settings.sales_rep}\n商品: ${p.product_desc} × ${p.qty}${p.unit}\n得意先希望納期: ${p.requested_delivery ?? "未定"}\n確認したいこと: ${p.question}` }],
    output_config: { format: zodOutputFormat(InquirySchema), effort: "low" },
  });
  if (!res.parsed_output) throw new Error("AI の応答を解析できませんでした");
  return res.parsed_output;
}

const ProposalSchema = z.object({
  opening: z.string().describe("商談冒頭で得意先に切り出す 2〜3 文"),
  pitches: z.array(z.object({
    product_code: z.string(),
    headline: z.string().describe("一言の提案フレーズ"),
    why_now: z.string().describe("同業の実績を根拠に、なぜこの得意先に勧めるか"),
    objection: z.string().describe("想定される反論と切り返し"),
  })),
  email_body: z.string().describe("訪問前に送る提案メール本文（簡潔に）"),
});
export type ProposalDraft = z.infer<typeof ProposalSchema>;

/** 横展開候補から提案トークとメールを作る。 */
export async function draftCrossSellProposal(result: CrossSellResult, settings: Settings, today: string): Promise<ProposalDraft> {
  if (!hasApiKey()) throw new AiUnavailableError();
  const cands = result.candidates.slice(0, 5).map((c) =>
    `- [${c.product.code}] ${c.product.name}（${c.product.maker} ${c.product.part_number}）参考売価 ${c.reference_price.toLocaleString()}円/${c.product.unit}
    根拠: ${c.reason}。同業の購入実績: ${c.peers.slice(0, 3).map((p) => `${p.customer.short_name} 累計${p.total_qty}${c.product.unit}（直近 ${p.last_date.slice(0, 10)}）`).join(" / ")}`,
  ).join("\n");
  const res = await getClient().beta.messages.parse({
    model: MODEL,
    max_tokens: 6000,
    betas: [...FALLBACK_BETAS],
    fallbacks: "default",
    system: [{ type: "text", text: SYSTEM_BASE + "\n\nいまの役割: 同業他社の購買実績をもとにした横展開提案。他社の社名は出さず『同業のお客様』と表現する。得意先の業種・メモに合わせて具体的に。", cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `本日: ${today}\n自社: ${settings.company_name} ${settings.sales_rep}\n\n提案先: ${result.customer.name}（${result.customer.industry}・${result.customer.prefecture}）担当 ${result.customer.contact_name ?? ""}\n得意先メモ: ${result.customer.notes}\n\n候補商品:\n${cands}` }],
    output_config: { format: zodOutputFormat(ProposalSchema), effort: "medium" },
  });
  if (!res.parsed_output) throw new Error("AI の応答を解析できませんでした");
  return res.parsed_output;
}

const ReviewSchema = z.object({
  verdict: z.enum(["ok", "caution", "stop"]).describe("ok=そのまま提出可 / caution=要確認 / stop=提出前に修正"),
  summary: z.string().describe("営業担当向けの 2〜3 文の総評"),
  actions: z.array(z.string()).describe("提出前にやるべきこと（具体的）"),
  remarks_suggestion: z.string().describe("見積書の備考欄に入れると良い文言"),
});
export type QuoteReview = z.infer<typeof ReviewSchema>;

/** 価格チェック結果を踏まえた見積りレビュー（人が最終判断するための要約）。 */
export async function reviewQuote(q: QuoteWithItems, checks: { line_no: number; description: string; checks: PriceCheck[] }[], settings: Settings, today: string): Promise<QuoteReview> {
  if (!hasApiKey()) throw new AiUnavailableError();
  const checkText = checks.map((c) => `明細${c.line_no} ${c.description}:\n${c.checks.length ? c.checks.map((x) => `  [${x.level}] ${x.title} — ${x.detail}`).join("\n") : "  問題なし"}`).join("\n");
  const res = await getClient().beta.messages.parse({
    model: MODEL,
    max_tokens: 3000,
    betas: [...FALLBACK_BETAS],
    fallbacks: "default",
    system: [{ type: "text", text: SYSTEM_BASE + "\n\nいまの役割: 見積り提出前のレビュー。赤字・大幅値引き・価格整合性の崩れを見逃さない。ただし営業判断（戦略的値引き）は尊重し、記録を残すよう促す。", cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `本日: ${today}\n粗利下限 ${settings.margin_floor_pct}% / 推奨 ${settings.margin_target_pct}%\n\n${quoteSummary(q, settings)}\n全体粗利率: ${q.margin_pct.toFixed(1)}%\n\n機械チェック結果:\n${checkText}\n\nこの見積りをレビューしてください。` }],
    output_config: { format: zodOutputFormat(ReviewSchema), effort: "medium" },
  });
  if (!res.parsed_output) throw new Error("AI の応答を解析できませんでした");
  return res.parsed_output;
}
