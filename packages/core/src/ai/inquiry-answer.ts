import { repSurname } from "../domain/rep-name";
import { z } from "zod";
import { betaZodOutputFormat as zodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { AiUnavailableError, FALLBACK_BETAS, MODEL, SYSTEM_BASE, getClient, hasApiKey } from "./client";
import type { InquiryFacts } from "../domain/inquiries";
import type { ResearchResult } from "./research";
import { INQUIRY_KIND_LABEL } from "../domain/types";

const Schema = z.object({
  short_reply: z.string().describe("SMS・LINE・電話で伝える 2〜4 行の回答。数字は社内記録とウェブ情報にあるものだけ"),
  mail_subject: z.string(),
  mail_body: z.string().describe("メール回答の本文。宛名・結び・署名を含む。社内記録の事実と、ウェブで調べた一般情報を区別して書く"),
  confidence: z.enum(["high", "medium", "low"]).describe("high=社内記録で裏付けあり / medium=ウェブ情報で補った / low=確認が必要"),
  open_points: z.array(z.string()).describe("送る前に営業担当が確認すべきこと"),
  next_action: z.string().describe("この問い合わせの次の一手（例: 仕入れ先に在庫確認、見積り作成）"),
});
export type InquiryAnswerDraft = z.infer<typeof Schema>;

/** 問い合わせの回答文を、社内記録（＋任意でウェブ調査）から下書きする。数字を作らせない。 */
export async function draftInquiryAnswer(facts: InquiryFacts, settings: { company_name: string; sales_rep: string }, today: string, web: ResearchResult | null = null): Promise<InquiryAnswerDraft> {
  if (!hasApiKey()) throw new AiUnavailableError();
  const i = facts.inquiry;
  const internal = {
    customer: facts.customer ? { name: facts.customer.name, contact: facts.customer.contact_name, industry: facts.customer.industry, notes: facts.customer.notes } : null,
    kind: INQUIRY_KIND_LABEL[i.kind],
    products: facts.products.map((f) => ({
      name: f.product.name, maker: f.product.maker, part_number: f.product.part_number, spec: f.product.spec, unit: f.product.unit, list_price: f.product.list_price,
      routes: f.routes.map((r) => ({ supplier: r.supplier_name, route: r.route_label, cost: r.cost, min_lot: r.min_lot, lead_days: r.lead_time_days })),
      earliest_delivery: f.earliest_delivery, last_price_to_customer: f.last_price_to_customer, other_customers_price_range: f.other_customers, same_category: f.same_category,
    })),
    recent_quotes: facts.recent_quotes, open_points: facts.open_points,
  };
  const res = await getClient().beta.messages.parse({
    model: MODEL, max_tokens: 3000, betas: [...FALLBACK_BETAS], fallbacks: "default",
    system: [{ type: "text", text: SYSTEM_BASE + "\n\nいまの役割: 得意先からの問い合わせへの回答文作成。仕入れ値・他社向け価格・仕入れ先名は得意先に出さない。社内記録に無い数字は書かず『確認のうえご連絡します』とする。ウェブ情報は『メーカー公開情報では』と断る。", cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `本日: ${today}\n自社: ${settings.company_name} ${settings.sales_rep}（名乗りは「${repSurname(settings.sales_rep)}」）\n\n【問い合わせ】（${INQUIRY_KIND_LABEL[i.kind]}）\n${i.question}\n\n【社内記録】\n${JSON.stringify(internal, null, 1)}\n\n【ウェブ調査】\n${web ? `${web.summary}\n出典: ${web.sources.map((s) => s.url).join(" ")}` : "（なし）"}\n\n短文回答とメール回答を作成してください。` }],
    output_config: { format: zodOutputFormat(Schema), effort: "medium" },
  });
  if (!res.parsed_output) throw new Error("AI の応答を解析できませんでした");
  return res.parsed_output;
}
