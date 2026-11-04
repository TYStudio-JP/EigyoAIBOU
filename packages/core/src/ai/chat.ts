import { z } from "zod";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import type Anthropic from "@anthropic-ai/sdk";
import type { Db } from "../db/connection";
import { AiUnavailableError, FALLBACK_BETAS, MODEL, SYSTEM_BASE, getClient, hasApiKey } from "./client";
import {
  addActivity, createQuote, currentSupplierPrices, findCustomer, findProducts, getDeal, getQuoteByNo, getSettings, listCalls, listDeals, listQuotes, listUsers,
  priceHistory, setQuoteStatus, today, type NewQuoteItem,
} from "../domain/repo";
import type { QuoteStatus } from "../domain/types";
import { checkPrice, proposePrice } from "../domain/pricing";
import { followupQueue } from "../domain/followup";
import { crossSellCandidates } from "../domain/crosssell";
import { dealTimeline, attachQuoteToDeal, timelineLine } from "../domain/deals";
import { refreshDealSummary } from "../domain/deal-refresh";
import { visitBrief } from "../domain/brief";
import { deliveryWaitingList } from "../domain/delivery";
import { priceImpact } from "../domain/price-impact";
import { reportDraft, reportFacts } from "../domain/report";
import { DEAL_STATUS_LABEL, ROUTE_LABEL, STATUS_LABEL } from "../domain/types";
import { WEB_SEARCH_TOOL } from "./research";

export interface ChatTurn { role: "user" | "assistant"; text: string; at: string; tools?: string[]; links?: { label: string; href: string }[] }
export interface ChatResult { reply: string; tools_used: string[]; links: { label: string; href: string }[] }

const J = (v: unknown) => JSON.stringify(v);

/** チャットで使える道具（Web の API・MCP と同じドメイン関数を呼ぶ。価格計算は AI にさせない）。 */
export function chatTools(db: Db, ctx: { userId: number | null; used: string[]; links: { label: string; href: string }[] }) {
  const mark = (name: string) => { if (!ctx.used.includes(name)) ctx.used.push(name); };
  const customer = (q: string) => { const h = findCustomer(db, q); if (!h.length) throw new Error(`得意先「${q}」が見つかりません`); if (h.length > 1) throw new Error(`候補が複数: ${h.map((c) => c.name).join(" / ")}`); return h[0]; };
  const product = (q: string) => { const h = findProducts(db, q, 3); if (!h.length) throw new Error(`商品「${q}」が見つかりません`); return h[0]; };
  return [
    betaZodTool({ name: "search_customers", description: "得意先を社名・担当者名・コードで探す", inputSchema: z.object({ query: z.string() }), run: ({ query }) => { mark("得意先検索"); return J(findCustomer(db, query).map((c) => ({ id: c.id, code: c.code, name: c.name, industry: c.industry, notes: c.notes }))); } }),
    betaZodTool({ name: "search_products", description: "商品を品番・商品名で探し、仕入れルート（原価・納期・最小ロット）も返す", inputSchema: z.object({ query: z.string() }), run: ({ query }) => { mark("商品検索"); return J(findProducts(db, query, 5).map((p) => ({ code: p.code, part_number: p.part_number, name: p.name, unit: p.unit, list_price: p.list_price, routes: currentSupplierPrices(db, p.id).map((r) => ({ supplier: r.supplier_name, route: ROUTE_LABEL[r.route_type], cost: r.cost, lead_days: r.lead_time_days, min_lot: r.min_lot })) }))); } }),
    betaZodTool({ name: "propose_price", description: "得意先×商品×数量の提案単価・値引き下限・チェック（原価割れ、前回より値下げ、他社との乖離、安いルート）。unit_price を渡すとその単価を検証", inputSchema: z.object({ customer: z.string(), product: z.string(), qty: z.number().positive(), unit_price: z.number().optional() }), run: ({ customer: c, product: p, qty, unit_price }) => {
      mark("価格照合"); const cu = customer(c); const pr = product(p); const prop = proposePrice(db, pr.id, cu.id, qty); const price = unit_price ?? prop.proposed_price;
      return J({ customer: cu.name, product: `${pr.name}（${pr.part_number}）`, qty, proposed_price: prop.proposed_price, basis: prop.proposal_basis, discount_floor: prop.floor_price, best_cost: prop.best_cost, best_supplier: prop.best_supplier_name, last_same_customer: prop.last_same_customer ? { date: prop.last_same_customer.date.slice(0, 10), unit_price: prop.last_same_customer.unit_price, quote_no: prop.last_same_customer.quote_no } : null, other_customers: prop.other_customers && { min: prop.other_customers.min, avg: prop.other_customers.avg, max: prop.other_customers.max }, checked_price: price, checks: checkPrice(prop, price, prop.best_cost ?? 0, prop.best_supplier_id, getSettings(db)).map((x) => `[${x.level}] ${x.title}: ${x.detail}`) });
    } }),
    betaZodTool({ name: "price_history", description: "商品の過去の見積り・受注単価（得意先別）", inputSchema: z.object({ product: z.string(), customer: z.string().optional() }), run: ({ product: p, customer: c }) => { mark("価格履歴"); const pr = product(p); const cu = c ? customer(c) : null; return J(priceHistory(db, pr.id, { customerId: cu?.id, limit: 15 }).map((h) => ({ date: h.date.slice(0, 10), quote_no: h.quote_no, status: STATUS_LABEL[h.status], customer: h.customer_name, qty: h.qty, unit_price: h.unit_price }))); } }),
    betaZodTool({ name: "list_quotes", description: "見積りの一覧（得意先・状態で絞り込み）", inputSchema: z.object({ customer: z.string().optional(), status: z.enum(["draft", "submitted", "tracking", "won", "lost"]).optional() }), run: ({ customer: c, status }) => { mark("見積り一覧"); const cu = c ? customer(c) : null; return J(listQuotes(db, { customerId: cu?.id, status: status ? [status as QuoteStatus] : undefined, limit: 20 }).map((q) => ({ id: q.id, quote_no: q.quote_no, customer: q.customer_name, subject: q.subject, status: STATUS_LABEL[q.status], total: Math.round(q.total), submitted_at: q.submitted_at }))); } }),
    betaZodTool({ name: "get_quote", description: "見積番号から明細と経緯を取得", inputSchema: z.object({ quote_no: z.string() }), run: ({ quote_no }) => { mark("見積り参照"); const q = getQuoteByNo(db, quote_no); if (!q) throw new Error("見積りが見つかりません"); ctx.links.push({ label: q.quote_no, href: `/quotes/${q.id}` }); return J({ ...q, status: STATUS_LABEL[q.status], items: q.items.map((it) => ({ description: it.description, qty: it.qty, unit: it.unit, unit_price: it.unit_price, cost: it.cost, supplier: it.supplier?.name })) }); } }),
    betaZodTool({ name: "followup_queue", description: "そろそろフォローすべき提出済み見積り（緊急度順）", inputSchema: z.object({}), run: () => { mark("追跡"); return J(followupQueue(db).slice(0, 15).map((f) => ({ urgency: f.urgency, quote_no: f.quote.quote_no, id: f.quote.id, customer: f.quote.customer_name, subject: f.quote.subject, total: Math.round(f.quote.total), days: f.days_since_submit, suggestion: f.suggestion }))); } }),
    betaZodTool({ name: "list_deals", description: "案件（得意先×ひとつの話）の一覧。状態・次の一手・期限付き", inputSchema: z.object({ customer: z.string().optional(), open_only: z.boolean().optional() }), run: ({ customer: c, open_only }) => { mark("案件一覧"); const cu = c ? customer(c) : null; return J(listDeals(db, { customerId: cu?.id, openOnly: open_only ?? true, limit: 20 }).map((d) => ({ id: d.id, customer: d.customer.short_name, contact: d.contact?.name, title: d.title, status: DEAL_STATUS_LABEL[d.status], amount: Math.round(d.amount), next_action: d.next_action, due: d.next_action_due, summary: d.summary }))); } }),
    betaZodTool({ name: "get_deal", description: "案件の経緯（要約・詳細・時系列）", inputSchema: z.object({ deal_id: z.number().int() }), run: ({ deal_id }) => { mark("案件参照"); const d = getDeal(db, deal_id); if (!d) throw new Error("案件が見つかりません"); ctx.links.push({ label: d.title, href: `/deals/${d.id}` }); return J({ title: d.title, customer: d.customer.name, contact: d.contact?.name, status: DEAL_STATUS_LABEL[d.status as keyof typeof DEAL_STATUS_LABEL], amount: Math.round(d.amount), summary: d.summary, detail: d.summary_detail, next_action: d.next_action, due: d.next_action_due, timeline: dealTimeline(db, deal_id).slice(0, 15).map(timelineLine) }); } }),
    betaZodTool({ name: "list_calls", description: "最近の電話メモ（議事録・依頼事項）", inputSchema: z.object({ customer: z.string().optional() }), run: ({ customer: c }) => { mark("電話メモ"); const cu = c ? customer(c) : null; return J(listCalls(db, { customerId: cu?.id, limit: 10 }).map((x) => ({ id: x.id, at: x.started_at.slice(0, 16), customer: x.customer?.short_name, contact: x.contact?.name, status: x.status, summary: x.minutes?.summary ?? x.memo.slice(0, 100), needs_human: x.minutes?.requests.filter((r) => r.result?.status === "needs_human").map((r) => r.result!.headline) }))); } }),
    betaZodTool({ name: "visit_brief", description: "訪問前ブリーフ（担当者・進行中案件・直近の電話・返事待ち・定番品・横展開・申し送り）", inputSchema: z.object({ customer: z.string() }), run: ({ customer: c }) => { mark("訪問前ブリーフ"); const cu = customer(c); ctx.links.push({ label: `${cu.short_name} 訪問前`, href: `/customers/${cu.id}/brief` }); return J(visitBrief(db, cu.id)); } }),
    betaZodTool({ name: "cross_sell", description: "同業で売れていて未購入の商品（横展開候補）", inputSchema: z.object({ customer: z.string() }), run: ({ customer: c }) => { mark("横展開"); const cu = customer(c); const r = crossSellCandidates(db, cu.id, 5); return J(r.candidates.map((x) => ({ product: x.product.name, code: x.product.code, reference_price: x.reference_price, reason: x.reason }))); } }),
    betaZodTool({ name: "delivery_waiting", description: "仕入れ先の納期回答待ちの見積り明細", inputSchema: z.object({}), run: () => { mark("納期"); return J(deliveryWaitingList(db).slice(0, 15).map((w) => ({ quote_no: w.quote.quote_no, customer: w.quote.customer.short_name, requested: w.quote.requested_delivery, items: w.waiting_items.map((it) => it.description) }))); } }),
    betaZodTool({ name: "price_impact", description: "現在の仕入れ値（または値上げ率を仮定）で粗利下限を割る得意先×商品", inputSchema: z.object({ pct: z.number().optional() }), run: ({ pct }) => { mark("価格改定"); return J(priceImpact(db, pct ? { pct } : null).rows.filter((r) => pct || r.level !== "ok").slice(0, 20).map((r) => ({ customer: r.customer.short_name, product: r.product.name, last_price: r.last_price, cost_now: r.cost_now, margin_now: r.margin_now, needed_price: r.needed_price, gap_amount: r.gap_amount }))); } }),
    betaZodTool({ name: "daily_report", description: "指定日の営業日報の下書き", inputSchema: z.object({ date: z.string().optional() }), run: ({ date }) => { mark("日報"); return reportDraft(reportFacts(db, date ?? today(), ctx.userId)); } }),
    betaZodTool({ name: "create_quote", description: "見積りの下書きを作る（単価省略時は履歴に基づく提案単価）。作成後は見積番号と確認事項を伝える", inputSchema: z.object({ customer: z.string(), subject: z.string(), items: z.array(z.object({ product: z.string(), qty: z.number().positive(), unit_price: z.number().optional() })).min(1), requested_delivery: z.string().optional() }), run: async ({ customer: c, subject, items, requested_delivery }) => {
      mark("見積り作成"); const cu = customer(c); const s = getSettings(db); const notes: string[] = [];
      const lines: NewQuoteItem[] = items.map((it) => { const pr = product(it.product); const prop = proposePrice(db, pr.id, cu.id, it.qty); const price = it.unit_price ?? prop.proposed_price; for (const x of checkPrice(prop, price, prop.best_cost ?? 0, prop.best_supplier_id, s)) if (x.level !== "info") notes.push(`${pr.name}: ${x.title}`); return { product_id: pr.id, description: `${pr.name}（${pr.part_number}）`, qty: it.qty, unit: pr.unit, unit_price: price, cost: prop.best_cost ?? 0, supplier_id: prop.best_supplier_id, remarks: "" }; });
      const q = createQuote(db, { customer_id: cu.id, subject, items: lines, requested_delivery: requested_delivery ?? null, source_type: "chat", source_text: "" });
      const link = await attachQuoteToDeal(db, q.id); await refreshDealSummary(db, link.deal.id, { useAi: false });
      ctx.links.push({ label: `見積り ${q.quote_no}`, href: `/quotes/${q.id}` });
      return J({ quote_no: q.quote_no, total: Math.round(q.total), margin_pct: Math.round(q.margin_pct * 10) / 10, deal: link.deal.title, warnings: notes, items: q.items.map((it) => ({ description: it.description, qty: it.qty, unit_price: it.unit_price })) });
    } }),
    betaZodTool({ name: "record_followup", description: "見積りにフォロー記録（電話・訪問・メールの内容）を残す", inputSchema: z.object({ quote_no: z.string(), body: z.string() }), run: ({ quote_no, body }) => { mark("フォロー記録"); const q = getQuoteByNo(db, quote_no); if (!q) throw new Error("見積りが見つかりません"); addActivity(db, q.id, "followup", body); if (q.status === "submitted") setQuoteStatus(db, q.id, "tracking", { note: "フォロー記録により自動遷移" }); ctx.links.push({ label: q.quote_no, href: `/quotes/${q.id}` }); return `${quote_no} に記録しました`; } }),
  ];
}

const CHAT_SYSTEM = SYSTEM_BASE + `

いまの役割: 営業担当からの質問に、道具（検索・価格照合・案件・電話メモ・日報など）で事実を取ってから答えるチャット相手。
- 数字（単価・原価・納期・金額）は必ず道具の結果から。推測で埋めない。該当が無ければ「記録がありません」と言う。
- スマホで読む前提。結論を 1〜2 行で先に、根拠は箇条書きで 3〜5 行まで。Markdown の見出しは使わず、太字と箇条書きだけ。
- 得意先名や品番が曖昧なら、まず検索して候補を出し、1 つに絞れないときは聞き返す。
- 見積り作成やフォロー記録など「書き込む」道具は、依頼が明確なときだけ使い、何をしたか見積番号付きで報告する。価格を変えるときは値引き下限を併記する。
- 他社の社名は得意先への文面に入れない（「同業のお客様」と言い換える）。
- 社内の記録に無いこと（メーカーの仕様・規格・相場・業界ニュース・得意先の会社情報）は web_search で調べ、出典 URL を本文に添える。社内の記録とウェブの情報は区別して書く。
- 「この商品の同等品は？」「サイズは何ミリ？」のような商品の質問は、まず search_products で自社の品番・メーカー・仕様を特定し、その品番でウェブを調べる。同等品はメーカー／品番／主な違いの箇条書き、寸法は数値と単位で答える。`;

/** 1 ターン分のチャット。履歴（テキストのみ）＋新しい発言 → 道具を使って回答。 */
export async function runChat(db: Db, history: ChatTurn[], userMessage: string, userId: number | null): Promise<ChatResult> {
  if (!hasApiKey()) throw new AiUnavailableError();
  const ctx = { userId, used: [] as string[], links: [] as { label: string; href: string }[] };
  const me = userId ? listUsers(db, { includeInactive: true }).find((u) => u.id === userId) : null;
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history.slice(-12).map((t) => ({ role: t.role, content: t.text }) as Anthropic.Beta.BetaMessageParam),
    { role: "user", content: userMessage },
  ];
  const runner = getClient().beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 4000,
    betas: [...FALLBACK_BETAS],
    fallbacks: "default",
    system: [{ type: "text", text: CHAT_SYSTEM, cache_control: { type: "ephemeral" } }, { type: "text", text: `本日: ${today()}。操作ユーザー: ${me ? `${me.name}（${me.department}）` : "不明"}` }],
    messages,
    tools: [...chatTools(db, ctx), WEB_SEARCH_TOOL],
    max_iterations: 8,
    thread: false,
    output_config: { effort: "low" },
  });
  const final = await runner;
  if (final.stop_reason === "refusal") return { reply: "この質問には回答できませんでした。", tools_used: ctx.used, links: ctx.links };
  const reply = final.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n").trim() || "（回答を生成できませんでした）";
  // ウェブ検索の出典をリンクとして添える
  const seenUrl = new Set<string>();
  for (const m of runner.params.messages) {
    if (m.role !== "assistant" || typeof m.content === "string") continue;
    for (const b of m.content) {
      if (b.type === "web_search_tool_result" && Array.isArray(b.content)) { if (!ctx.used.includes("ウェブ検索")) ctx.used.push("ウェブ検索"); for (const r of b.content) if (r.type === "web_search_result" && !seenUrl.has(r.url)) { seenUrl.add(r.url); ctx.links.push({ label: r.title.slice(0, 40), href: r.url }); } }
    }
  }
  for (const b of final.content) if (b.type === "text" && b.citations) for (const c of b.citations) if (c.type === "web_search_result_location" && !seenUrl.has(c.url)) { seenUrl.add(c.url); ctx.links.push({ label: (c.title ?? c.url).slice(0, 40), href: c.url }); }
  const seen = new Set<string>();
  return { reply, tools_used: ctx.used, links: ctx.links.filter((l) => (seen.has(l.href) ? false : (seen.add(l.href), true))) };
}
