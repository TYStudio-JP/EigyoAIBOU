import type { Db } from "../db/connection";
import type { CallWithCustomer, DealStatus, DealWithRefs, QuoteStatus } from "./types";
import { DEAL_STATUS_LABEL, STATUS_LABEL } from "./types";
import {
  addDays, addDealEvent, createDeal, daysBetween, getCall, getDeal, getQuote, listActivities, listCalls, listDealEvents, listDeals, listQuotes,
  setCallDeal, setQuoteDeal, today, touchDeal, updateDeal, type QuoteSummary,
} from "./repo";

/** 案件の状態は、紐づく見積り・通話から機械的に決める（人は入力しない）。 */
export function deriveDealStatus(db: Db, dealId: number, asOf: string = today()): DealStatus {
  const deal = getDeal(db, dealId);
  if (!deal) throw new Error(`deal ${dealId} not found`);
  const quotes = listQuotes(db, { dealId, limit: 100 });
  const order: QuoteStatus[] = ["draft", "submitted", "tracking", "won", "lost"];
  const openQuotes = quotes.filter((q) => q.status !== "won" && q.status !== "lost");
  if (quotes.length && openQuotes.length === 0) {
    // すべて決着：受注が 1 つでもあれば受注、全て失注なら失注
    return quotes.some((q) => q.status === "won") ? "won" : "lost";
  }
  if (openQuotes.length) {
    const top = openQuotes.reduce((a, b) => (order.indexOf(a.status) > order.indexOf(b.status) ? a : b));
    const map: Record<QuoteStatus, DealStatus> = { draft: "quoting", submitted: "submitted", tracking: "tracking", won: "won", lost: "lost" };
    const s = map[top.status];
    return daysBetween(deal.last_activity_at, asOf) > 45 ? "dormant" : s;
  }
  return daysBetween(deal.last_activity_at, asOf) > 45 ? "dormant" : "inquiry";
}
export function applyDealStatus(db: Db, dealId: number, asOf: string = today()): DealWithRefs {
  const next = deriveDealStatus(db, dealId, asOf);
  const deal = getDeal(db, dealId)!;
  if (deal.status !== next) {
    updateDeal(db, dealId, { status: next, closed_at: next === "won" || next === "lost" ? (deal.closed_at ?? asOf) : null });
    addDealEvent(db, dealId, "status", `案件の状態 → ${DEAL_STATUS_LABEL[next]}`);
  }
  return getDeal(db, dealId)!;
}

// ---------- タイムライン ----------
export interface TimelineItem { at: string; kind: string; title: string; body: string; ref_type: string | null; ref_id: number | null }
export function dealTimeline(db: Db, dealId: number): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const e of listDealEvents(db, dealId)) {
    if (e.kind === "quote" || e.kind === "call") continue; // 見積り・通話本体は下で詳しく出す
    items.push({ at: e.created_at, kind: e.kind, title: { created: "案件作成", status: "状態変更", link: "紐づけ", note: "メモ", ai: "営業AI棒", mail: "メール", handover: "担当引継ぎ" }[e.kind] ?? e.kind, body: e.body, ref_type: e.ref_type, ref_id: e.ref_id });
  }
  for (const q of listQuotes(db, { dealId, limit: 100 })) {
    items.push({ at: q.created_at, kind: "quote", title: `見積り ${q.quote_no}（${STATUS_LABEL[q.status]}）`, body: `${q.subject}　${Math.round(q.total).toLocaleString()}円`, ref_type: "quote", ref_id: q.id });
    for (const a of listActivities(db, q.id)) {
      if (a.kind === "created") continue;
      items.push({ at: a.created_at, kind: a.kind === "followup" ? "followup" : a.kind, title: `${q.quote_no} ${{ followup: "フォロー", status: "状態", ai: "営業AI棒", note: "メモ" }[a.kind] ?? a.kind}`, body: a.body, ref_type: "quote", ref_id: q.id });
    }
  }
  for (const c of listCalls(db, { dealId, limit: 100 })) {
    const first = c.minutes?.summary.split("\n").map((l) => l.replace(/^・/, "")).filter(Boolean) ?? [];
    items.push({ at: c.started_at, kind: "call", title: `電話（${{ in: "着信", out: "発信", unknown: "通話" }[c.direction]}）${c.contact ? c.contact.name : ""}`, body: first.slice(0, 3).join(" / ") || c.memo.slice(0, 80) || "メモ未入力", ref_type: "call", ref_id: c.id });
    if (c.status === "sent") items.push({ at: c.updated_at, kind: "mail", title: "確認メール送付", body: c.mail_subject ?? "", ref_type: "call", ref_id: c.id });
  }
  return items.sort((a, b) => b.at.localeCompare(a.at));
}

// ---------- 自動紐づけ ----------
export interface LinkInput {
  customer_id: number;
  contact_id?: number | null;
  text: string;                 // 件名・メモ・依頼文など、新しく入ってきた内容
  product_ids?: number[];       // 言及された商品
  quote_no?: string | null;     // 言及された見積番号
  at?: string;                  // 発生日時
}
export interface LinkCandidate { deal: DealWithRefs; score: number; reasons: string[] }
export interface LinkDecision {
  deal: DealWithRefs;
  created: boolean;
  confidence: "high" | "medium" | "low";
  reason: string;
  alternatives: DealWithRefs[];
}

const tokenize = (s: string): string[] => {
  const t = s.replace(/[\s、。・（）()【】\[\]「」／/]/g, " ").split(" ").filter((x) => x.length >= 2);
  return [...new Set(t)];
};

/** 候補案件を機械的に採点する（見積番号 > 商品の重なり > 担当者 > 語の一致 > 直近性）。 */
export function scoreDealCandidates(db: Db, input: LinkInput): LinkCandidate[] {
  const asOf = (input.at ?? today()).slice(0, 10);
  const candidates = listDeals(db, { customerId: input.customer_id, limit: 100 }).filter((d) => d.status !== "lost" && (d.status !== "won" || daysBetween(d.last_activity_at, asOf) <= 14));
  const inputTokens = tokenize(input.text);
  return candidates
    .map((deal) => {
      let score = 0;
      const reasons: string[] = [];
      const quotes = listQuotes(db, { dealId: deal.id, limit: 50 });
      if (input.quote_no && quotes.some((q) => q.quote_no === input.quote_no)) { score += 1.0; reasons.push(`見積番号 ${input.quote_no} に言及`); }
      if (input.product_ids?.length) {
        const dealProducts = new Set<number>();
        for (const q of quotes) for (const it of getQuote(db, q.id)?.items ?? []) if (it.product_id) dealProducts.add(it.product_id);
        const overlap = input.product_ids.filter((p) => dealProducts.has(p)).length;
        if (overlap) { score += Math.min(0.6, 0.25 + overlap * 0.15); reasons.push(`同じ商品 ${overlap} 点`); }
      }
      if (input.contact_id && deal.contact_id === input.contact_id) { score += 0.25; reasons.push("同じ担当者"); }
      const dealTokens = tokenize(deal.title + " " + deal.summary + " " + quotes.map((q) => q.subject).join(" "));
      const common = inputTokens.filter((t) => dealTokens.some((d) => d.includes(t) || t.includes(d)));
      if (common.length) { score += Math.min(0.4, common.length * 0.1); reasons.push(`語の一致: ${common.slice(0, 3).join("・")}`); }
      const age = daysBetween(deal.last_activity_at, asOf);
      if (age <= 14) { score += 0.2; reasons.push("直近 2 週間に動きあり"); } else if (age <= 45) score += 0.05;
      if (deal.status === "won") score -= 0.3;
      return { deal, score, reasons };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score);
}

/** AI による裁定（任意）。候補と新しい内容を見て「どの案件か／新規か」を返す。 */
export type Adjudicator = (args: { input: LinkInput; candidates: LinkCandidate[] }) => Promise<{ deal_id: number | null; confidence: "high" | "medium" | "low"; title: string; reason: string } | null>;

/** 新規か既存かを決めて紐づける。確信が高ければ黙って付け、迷えば一番近い案件に付けて候補を返す。 */
export async function autoLink(db: Db, input: LinkInput, opts: { adjudicate?: Adjudicator; titleHint?: string } = {}): Promise<LinkDecision> {
  const cands = scoreDealCandidates(db, input);
  const best = cands[0];
  let decision: { deal_id: number | null; confidence: "high" | "medium" | "low"; title: string; reason: string } | null = null;
  if (best && best.score >= 0.9) decision = { deal_id: best.deal.id, confidence: "high", title: best.deal.title, reason: best.reasons.join("、") };
  else if (opts.adjudicate && (best || input.text.length > 10)) {
    try { decision = await opts.adjudicate({ input, candidates: cands.slice(0, 5) }); } catch { decision = null; }
  }
  if (!decision) {
    if (best && best.score >= 0.45) decision = { deal_id: best.deal.id, confidence: "medium", title: best.deal.title, reason: best.reasons.join("、") };
    else decision = { deal_id: null, confidence: best ? "low" : "medium", title: opts.titleHint ?? fallbackTitle(input.text), reason: best ? "既存案件との共通点が少ないため新規" : "進行中の案件が無いため新規" };
  }
  let deal: DealWithRefs;
  let created = false;
  if (decision.deal_id) {
    deal = getDeal(db, decision.deal_id)!;
  } else {
    deal = createDeal(db, { customer_id: input.customer_id, contact_id: input.contact_id ?? null, title: decision.title || fallbackTitle(input.text), opened_at: input.at });
    created = true;
  }
  const alternatives = cands.filter((c) => c.deal.id !== deal.id).slice(0, 3).map((c) => c.deal);
  return { deal, created, confidence: decision.confidence, reason: decision.reason, alternatives };
}

export function fallbackTitle(text: string): string {
  const first = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)[0] ?? "新規案件";
  return first.replace(/^件名[:：]\s*/, "").slice(0, 30);
}

/** 見積り保存時：案件に紐づけ（新規なら作成）、状態を再計算。 */
export async function attachQuoteToDeal(db: Db, quoteId: number, opts: { adjudicate?: Adjudicator; force_deal_id?: number | null } = {}): Promise<LinkDecision> {
  const q = getQuote(db, quoteId);
  if (!q) throw new Error("quote not found");
  let decision: LinkDecision;
  if (opts.force_deal_id) {
    decision = { deal: getDeal(db, opts.force_deal_id)!, created: false, confidence: "high", reason: "手動で指定", alternatives: [] };
  } else {
    decision = await autoLink(db, {
      customer_id: q.customer_id, contact_id: q.contact_id, text: `${q.subject}\n${q.source_text}`.trim(),
      product_ids: q.items.map((it) => it.product_id).filter((x): x is number => x !== null), at: q.created_at,
    }, { adjudicate: opts.adjudicate, titleHint: q.subject });
  }
  setQuoteDeal(db, quoteId, decision.deal.id, q.contact_id);
  applyDealStatus(db, decision.deal.id);
  return decision;
}

/** 通話処理時：案件に紐づけ。依頼事項から作られた見積りも同じ案件へ。 */
export async function attachCallToDeal(db: Db, callId: number, opts: { adjudicate?: Adjudicator; force_deal_id?: number | null } = {}): Promise<LinkDecision | null> {
  const c = getCall(db, callId);
  if (!c || !c.customer_id) return null;
  const m = c.minutes;
  const text = [m?.summary ?? "", ...(m?.requests.map((r) => r.detail) ?? []), c.memo].join("\n");
  const quoteNo = m?.requests.map((r) => r.quote_no).find(Boolean) ?? null;
  let decision: LinkDecision;
  if (opts.force_deal_id) decision = { deal: getDeal(db, opts.force_deal_id)!, created: false, confidence: "high", reason: "手動で指定", alternatives: [] };
  else {
    const productIds: number[] = [];
    for (const r of m?.requests ?? []) if (r.result?.quote_id) for (const it of getQuote(db, r.result.quote_id)?.items ?? []) if (it.product_id) productIds.push(it.product_id);
    decision = await autoLink(db, { customer_id: c.customer_id, contact_id: c.contact_id, text, product_ids: productIds, quote_no: quoteNo, at: c.started_at }, { adjudicate: opts.adjudicate, titleHint: m?.requests[0]?.detail.slice(0, 30) });
  }
  setCallDeal(db, callId, decision.deal.id, c.contact_id);
  for (const r of m?.requests ?? []) if (r.result?.quote_id) setQuoteDeal(db, r.result.quote_id, decision.deal.id, c.contact_id);
  applyDealStatus(db, decision.deal.id);
  return decision;
}

// ---------- 要約（AI 無しの決定的フォールバック） ----------
export function fallbackDealSummary(db: Db, dealId: number): { summary: string; summary_detail: string; next_action: string; next_action_due: string | null } {
  const deal = getDeal(db, dealId)!;
  const tl = dealTimeline(db, dealId);
  const quotes = listQuotes(db, { dealId, limit: 50 });
  const open = quotes.filter((q) => q.status === "submitted" || q.status === "tracking");
  const lines = [
    `${deal.customer.short_name}${deal.contact ? `（${deal.contact.name}）` : ""}の「${deal.title}」。状態: ${DEAL_STATUS_LABEL[deal.status]}。`,
    tl[0] ? `直近: ${tl[0].at.slice(0, 10)} ${tl[0].title} ${tl[0].body}`.slice(0, 80) : "動きなし。",
    open.length ? `提出中の見積り ${open.length} 件（${Math.round(open.reduce((s, q) => s + q.total, 0)).toLocaleString()}円）。` : quotes.length ? `見積り ${quotes.length} 件。` : "見積り未作成。",
  ];
  let next_action = "";
  let next_action_due: string | null = null;
  if (deal.status === "inquiry") { next_action = "見積りを作成して提出"; next_action_due = addDays(today(), 2); }
  else if (deal.status === "quoting") { next_action = "下書きの見積りを確認して提出"; next_action_due = addDays(today(), 1); }
  else if (deal.status === "submitted" || deal.status === "tracking") { next_action = "検討状況をフォロー（納期・競合の有無）"; next_action_due = addDays((open[0]?.last_followup_at ?? open[0]?.submitted_at ?? today()).slice(0, 10), 3); }
  else if (deal.status === "dormant") { next_action = "案件が生きているか確認し、消滅なら失注理由を記録"; next_action_due = today(); }
  return { summary: lines.join("\n"), summary_detail: tl.slice(0, 10).map((t) => `${t.at.slice(0, 16)} ${t.title}: ${t.body}`).join("\n"), next_action, next_action_due };
}

/** 既存データ（見積り・通話）を案件にまとめ直す。得意先ごとに、30 日以内で商品が重なる見積りを同じ案件にする。 */
export function backfillDeals(db: Db): number {
  const quotes = listQuotes(db, { limit: 10000 }).sort((a, b) => a.created_at.localeCompare(b.created_at));
  let created = 0;
  for (const q of quotes) {
    const row = getQuote(db, q.id)!;
    if (row.deal_id) continue;
    const productIds = row.items.map((it) => it.product_id).filter((x): x is number => x !== null);
    const cands = scoreDealCandidates(db, { customer_id: row.customer_id, contact_id: row.contact_id, text: row.subject, product_ids: productIds, at: row.created_at });
    const best = cands[0];
    let dealId: number;
    if (best && best.score >= 0.45 && daysBetween(best.deal.last_activity_at, row.created_at.slice(0, 10)) <= 30) dealId = best.deal.id;
    else { dealId = createDeal(db, { customer_id: row.customer_id, contact_id: row.contact_id, title: row.subject, opened_at: row.created_at }).id; created++; }
    setQuoteDeal(db, row.id, dealId, row.contact_id);
    touchDeal(db, dealId, row.updated_at);
  }
  for (const c of listCalls(db, { limit: 10000 })) {
    if (c.deal_id || !c.customer_id) continue;
    const open = listDeals(db, { customerId: c.customer_id, openOnly: true, limit: 5 });
    if (open[0]) setCallDeal(db, c.id, open[0].id, c.contact_id);
    else { const d = createDeal(db, { customer_id: c.customer_id, contact_id: c.contact_id, title: c.minutes?.requests[0]?.detail.slice(0, 30) || "電話問い合わせ", opened_at: c.started_at }); created++; setCallDeal(db, c.id, d.id, c.contact_id); }
  }
  for (const d of listDeals(db, { limit: 10000 })) {
    applyDealStatus(db, d.id);
    const fb = fallbackDealSummary(db, d.id);
    updateDeal(db, d.id, fb);
  }
  return created;
}

/** 今日動かすべき案件（期限切れの次の一手 → 期限が今日 → 追跡中 → その他）。 */
export function dealsToMove(db: Db, limit = 10): DealWithRefs[] {
  const t = today();
  const order = (d: DealWithRefs) => (d.next_action_due && d.next_action_due < t ? 0 : d.next_action_due === t ? 1 : d.status === "submitted" || d.status === "tracking" ? 2 : d.status === "inquiry" || d.status === "quoting" ? 3 : 4);
  return listDeals(db, { openOnly: true, limit: 500 }).filter((d) => d.status !== "dormant").sort((a, b) => order(a) - order(b) || b.amount - a.amount).slice(0, limit);
}

/** 得意先ごとに「誰がどの納入先を見ているか」を案件から集計する（ディーラー向け）。 */
export function contactEndCustomerMap(db: Db, customerId: number): { contact_id: number | null; contact_name: string; end_customers: string[]; deals: number }[] {
  const map = new Map<number | null, { contact_name: string; ends: Set<string>; deals: number }>();
  for (const d of listDeals(db, { customerId, limit: 1000 })) {
    const key = d.contact_id;
    const e = map.get(key) ?? { contact_name: d.contact?.name ?? "担当者未設定", ends: new Set<string>(), deals: 0 };
    if (d.end_customer) e.ends.add(d.end_customer.name);
    e.deals++;
    map.set(key, e);
  }
  return [...map.entries()].map(([contact_id, v]) => ({ contact_id, contact_name: v.contact_name, end_customers: [...v.ends], deals: v.deals }));
}

/** シード用：全案件（状態問わず）。 */
export function listDealsForSeed(db: Db): DealWithRefs[] {
  return listDeals(db, { limit: 10000 });
}

export type { CallWithCustomer as _CallRef, QuoteSummary as _QuoteRef };
