#!/usr/bin/env node
/**
 * 営業AI棒 MCP サーバー（stdio）
 * Claude Code / Claude Desktop から、見積り作成・価格チェック・追跡・横展開提案を直接呼び出せるようにする。
 * Web アプリと同じ SQLite（data/eigyo.db）とドメインロジック（@eigyo/core）を共有する。
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  addActivity, checkPrice, createQuote, crossSellCandidates, currentSupplierPrices, findCustomer, findProducts, followupQueue,
  getQuote, getQuoteByNo, getSettings, hasApiKey, listActivities, listCustomers, listQuotes, lostReasonStats, openDb, priceHistory,
  proposePrice, ROUTE_LABEL, seedDatabase, setQuoteStatus, STATUS_LABEL, today, extractQuoteRequest, extractQuoteRequestFallback,
  createCall, executeCallRequests, findCustomerByTel, listCalls, structureCallMemo, composeCallConfirmation, updateCall, CALL_REQUEST_LABEL,
  adjudicateDealLink, attachCallToDeal, attachQuoteToDeal, dealTimeline, getDeal, handoverCustomer, handoverFacts, listContacts, listDeals, listUsers, refreshDealSummary, DEAL_STATUS_LABEL, CONTACT_STATUS_LABEL,
  buildKeijo, deliveryWaitingList, recordSupplierDelivery, deliveryNotice, priceImpact, reportFacts, reportDraft, visitBrief, listSuppliers,
  type LostReason, type NewQuoteItem, type QuoteStatus,
} from "@eigyo/core";

const db = openDb();
if (listCustomers(db).length === 0) seedDatabase(db);

const server = new McpServer({ name: "eigyo-aibou", version: "0.1.0" });
const text = (v: unknown) => ({ content: [{ type: "text" as const, text: typeof v === "string" ? v : JSON.stringify(v, null, 2) }] });
const yen = (n: number | null | undefined) => (n == null ? "-" : `${Math.round(n).toLocaleString("ja-JP")}円`);

function resolveCustomer(q: string) {
  const hits = findCustomer(db, q);
  if (hits.length === 1) return hits[0];
  if (hits.length === 0) throw new Error(`得意先「${q}」が見つかりません。search_customers で確認してください。`);
  throw new Error(`得意先「${q}」の候補が複数あります: ${hits.map((c) => `${c.code} ${c.name}`).join(" / ")}`);
}
function resolveProduct(q: string) {
  const hits = findProducts(db, q, 5);
  if (!hits.length) throw new Error(`商品「${q}」が見つかりません。search_products で確認してください。`);
  return hits[0];
}

server.registerTool("search_customers", {
  title: "得意先を検索",
  description: "得意先コード・社名・略称・担当者名で得意先を検索する。",
  inputSchema: { query: z.string().describe("検索語（例: みどり食品 / C003 / 高橋）") },
}, async ({ query }) => text(findCustomer(db, query).map((c) => ({ code: c.code, name: c.name, industry: c.industry, contact: c.contact_name, notes: c.notes }))));

server.registerTool("search_products", {
  title: "商品を検索",
  description: "自社商品コード・メーカー品番・商品名で商品を検索し、現在の仕入れルート（原価・最小ロット・納期）も返す。",
  inputSchema: { query: z.string().describe("検索語（例: EM-10-4F / エンドミル φ10 / 軍手）") },
}, async ({ query }) => text(findProducts(db, query, 8).map((p) => ({
  code: p.code, part_number: p.part_number, name: p.name, maker: p.maker, category: p.category, unit: p.unit, list_price: p.list_price,
  routes: currentSupplierPrices(db, p.id).map((r) => ({ supplier: r.supplier_name, route: ROUTE_LABEL[r.route_type], cost: r.cost, min_lot: r.min_lot, lead_days: r.lead_time_days })),
}))));

server.registerTool("price_history", {
  title: "販売価格の履歴",
  description: "商品の過去の見積り・受注単価を得意先別に返す（直近順）。",
  inputSchema: { product: z.string().describe("商品コード・品番・商品名"), customer: z.string().optional().describe("得意先コードや社名（指定すると絞り込み）") },
}, async ({ product, customer }) => {
  const p = resolveProduct(product);
  const c = customer ? resolveCustomer(customer) : null;
  return text({ product: `${p.code} ${p.name}`, history: priceHistory(db, p.id, { customerId: c?.id, limit: 20 }).map((h) => ({ date: h.date.slice(0, 10), quote_no: h.quote_no, status: STATUS_LABEL[h.status], customer: h.customer_name, qty: h.qty, unit_price: h.unit_price, cost: h.cost, supplier: h.supplier_name })) });
});

server.registerTool("propose_price", {
  title: "単価を提案してチェック",
  description: "得意先×商品×数量に対して、過去価格・原価・仕入れルートを踏まえた提案単価と値引き下限を返す。unit_price を渡すとその単価のチェック結果（赤字・前回より値下げ・他社との乖離・安いルート）も返す。",
  inputSchema: {
    customer: z.string().describe("得意先コードや社名"),
    product: z.string().describe("商品コード・品番・商品名"),
    qty: z.number().positive().describe("数量"),
    unit_price: z.number().optional().describe("検証したい単価（省略時は提案単価を検証）"),
  },
}, async ({ customer, product, qty, unit_price }) => {
  const c = resolveCustomer(customer);
  const p = resolveProduct(product);
  const prop = proposePrice(db, p.id, c.id, qty);
  const price = unit_price ?? prop.proposed_price;
  const checks = checkPrice(prop, price, prop.best_cost ?? 0, prop.best_supplier_id, getSettings(db));
  return text({
    customer: `${c.code} ${c.name}`, product: `${p.code} ${p.name}（${p.part_number}）`, qty,
    proposed_price: prop.proposed_price, basis: prop.proposal_basis, discount_floor: prop.floor_price, target_price: prop.target_price,
    best_cost: prop.best_cost, best_supplier: prop.best_supplier_name, best_route: prop.best_route,
    supplier_options: prop.supplier_options.map((o) => ({ supplier: o.supplier_name, route: ROUTE_LABEL[o.route_type], cost: o.cost, min_lot: o.min_lot, lead_days: o.lead_time_days })),
    last_same_customer: prop.last_same_customer ? { date: prop.last_same_customer.date.slice(0, 10), unit_price: prop.last_same_customer.unit_price, quote_no: prop.last_same_customer.quote_no } : null,
    other_customers: prop.other_customers ? { min: prop.other_customers.min, avg: prop.other_customers.avg, max: prop.other_customers.max, count: prop.other_customers.count } : null,
    checked_price: price, margin_pct: prop.best_cost ? Math.round(((price - prop.best_cost) / price) * 1000) / 10 : null,
    checks: checks.map((x) => ({ level: x.level, title: x.title, detail: x.detail })),
  });
});

server.registerTool("extract_request", {
  title: "依頼文を構造化",
  description: "得意先からのメール本文や電話メモから、商品・数量・納期・不明点を抽出する（API キーがあれば Claude、無ければ簡易抽出）。",
  inputSchema: { text: z.string().describe("依頼文") },
}, async ({ text: body }) => {
  const names = listCustomers(db).map((c) => `${c.short_name}（${c.name}）`);
  const ex = hasApiKey() ? await extractQuoteRequest({ text: body, today: today(), customerNames: names }) : extractQuoteRequestFallback(body, today());
  return text(ex);
});

server.registerTool("create_quote", {
  title: "見積りを作成",
  description: "得意先と明細から見積り（下書き）を作成する。単価を省略すると履歴に基づく提案単価を自動採用し、各明細のチェック結果を返す。Web アプリの見積り一覧にも即時反映される。",
  inputSchema: {
    customer: z.string().describe("得意先コードや社名"),
    subject: z.string().describe("件名"),
    items: z.array(z.object({
      product: z.string().optional().describe("商品コード・品番・商品名（未登録品は省略して description を使う）"),
      description: z.string().optional().describe("未登録品の品名"),
      qty: z.number().positive(),
      unit_price: z.number().optional().describe("省略時は提案単価"),
      remarks: z.string().optional(),
    })).min(1),
    requested_delivery: z.string().optional().describe("希望納期 YYYY-MM-DD"),
    notes: z.string().optional().describe("備考（見積書に印字）"),
    source_text: z.string().optional().describe("元の依頼文"),
  },
}, async ({ customer, subject, items, requested_delivery, notes, source_text }) => {
  const c = resolveCustomer(customer);
  const settings = getSettings(db);
  const report: unknown[] = [];
  const lines: NewQuoteItem[] = items.map((it) => {
    if (!it.product) return { product_id: null, description: it.description ?? "未登録品", qty: it.qty, unit: "個", unit_price: it.unit_price ?? 0, cost: 0, supplier_id: null, remarks: it.remarks ?? "" };
    const p = resolveProduct(it.product);
    const prop = proposePrice(db, p.id, c.id, it.qty);
    const price = it.unit_price ?? prop.proposed_price;
    const checks = checkPrice(prop, price, prop.best_cost ?? 0, prop.best_supplier_id, settings);
    report.push({ product: `${p.code} ${p.name}`, qty: it.qty, unit_price: price, basis: it.unit_price ? "指定単価" : prop.proposal_basis, cost: prop.best_cost, supplier: prop.best_supplier_name, checks: checks.map((x) => `[${x.level}] ${x.title}: ${x.detail}`) });
    return { product_id: p.id, description: `${p.name}（${p.part_number}）`, qty: it.qty, unit: p.unit, unit_price: price, cost: prop.best_cost ?? 0, supplier_id: prop.best_supplier_id, remarks: it.remarks ?? "" };
  });
  const q = createQuote(db, { customer_id: c.id, subject, items: lines, requested_delivery: requested_delivery ?? null, notes: notes ?? "", source_type: "mcp", source_text: source_text ?? "" });
  const link = await attachQuoteToDeal(db, q.id, { adjudicate: hasApiKey() ? adjudicateDealLink : undefined });
  await refreshDealSummary(db, link.deal.id, { useAi: false });
  return text({ quote_no: q.quote_no, id: q.id, deal: { id: link.deal.id, title: link.deal.title, created: link.created, confidence: link.confidence, reason: link.reason }, customer: c.name, total: q.total, total_cost: q.total_cost, margin_pct: Math.round(q.margin_pct * 10) / 10, valid_until: q.valid_until, promised_delivery: q.promised_delivery, url: `http://localhost:3000/quotes/${q.id}`, items: report });
});

server.registerTool("get_quote", {
  title: "見積りを取得",
  description: "見積番号（例: Q202611-003）で見積りの明細・経緯を取得する。",
  inputSchema: { quote_no: z.string() },
}, async ({ quote_no }) => {
  const q = getQuoteByNo(db, quote_no);
  if (!q) throw new Error(`見積り ${quote_no} が見つかりません`);
  return text({ ...q, status_label: STATUS_LABEL[q.status], items: q.items.map((it) => ({ line_no: it.line_no, description: it.description, qty: it.qty, unit: it.unit, unit_price: it.unit_price, cost: it.cost, supplier: it.supplier?.name ?? null, remarks: it.remarks })), activities: listActivities(db, q.id).map((a) => `${a.created_at} [${a.kind}] ${a.body}`) });
});

server.registerTool("list_quotes", {
  title: "見積り一覧",
  description: "ステータスや得意先で見積りを一覧する。",
  inputSchema: { status: z.enum(["draft", "submitted", "tracking", "won", "lost"]).optional(), customer: z.string().optional(), limit: z.number().int().positive().max(100).optional() },
}, async ({ status, customer, limit }) => {
  const c = customer ? resolveCustomer(customer) : null;
  return text(listQuotes(db, { status: status ? [status as QuoteStatus] : undefined, customerId: c?.id, limit: limit ?? 30 }).map((q) => ({ quote_no: q.quote_no, customer: q.customer_name, subject: q.subject, status: STATUS_LABEL[q.status], total: q.total, submitted_at: q.submitted_at, updated_at: q.updated_at })));
});

server.registerTool("followup_queue", {
  title: "追跡が必要な見積り",
  description: "提出済・追跡中の見積りから、フォローすべき案件を緊急度順に返す（「あの見積り、どうなった？」）。",
  inputSchema: {},
}, async () => text(followupQueue(db).map((f) => ({ urgency: f.urgency, quote_no: f.quote.quote_no, customer: f.quote.customer_name, subject: f.quote.subject, total: f.quote.total, days_since_submit: f.days_since_submit, days_since_last_touch: f.days_since_last_touch, suggestion: f.suggestion }))));

server.registerTool("record_followup", {
  title: "フォローを記録",
  description: "見積りにフォロー記録（電話・訪問・メールの内容）を追加する。提出済の案件は自動的に追跡中になる。",
  inputSchema: { quote_no: z.string(), body: z.string().describe("記録内容") },
}, async ({ quote_no, body }) => {
  const q = getQuoteByNo(db, quote_no);
  if (!q) throw new Error(`見積り ${quote_no} が見つかりません`);
  addActivity(db, q.id, "followup", body);
  if (q.status === "submitted") setQuoteStatus(db, q.id, "tracking", { note: "フォロー記録により自動遷移" });
  return text(`${quote_no} にフォローを記録しました。現在のステータス: ${STATUS_LABEL[getQuote(db, q.id)!.status]}`);
});

server.registerTool("set_quote_status", {
  title: "見積りのステータス変更",
  description: "下書き→提出済→追跡中→受注/失注 を進める。失注時は理由を記録する（次回提案の改善に使う）。",
  inputSchema: {
    quote_no: z.string(),
    status: z.enum(["draft", "submitted", "tracking", "won", "lost"]),
    lost_reason: z.enum(["price", "delivery", "competitor", "cancelled", "other"]).optional(),
    lost_detail: z.string().optional(),
  },
}, async ({ quote_no, status, lost_reason, lost_detail }) => {
  const q = getQuoteByNo(db, quote_no);
  if (!q) throw new Error(`見積り ${quote_no} が見つかりません`);
  const r = setQuoteStatus(db, q.id, status as QuoteStatus, { lost_reason: (lost_reason as LostReason) ?? null, lost_detail: lost_detail ?? null });
  return text(`${quote_no}: ${STATUS_LABEL[r.status]} に変更しました`);
});

server.registerTool("cross_sell", {
  title: "横展開の提案候補",
  description: "同業（同じ業種・似た購買カテゴリ）の得意先で売れていて、この得意先が未購入の商品を根拠付きで返す。",
  inputSchema: { customer: z.string().describe("得意先コードや社名"), limit: z.number().int().positive().max(20).optional() },
}, async ({ customer, limit }) => {
  const c = resolveCustomer(customer);
  const r = crossSellCandidates(db, c.id, limit ?? 8);
  return text({ customer: `${c.code} ${c.name}（${c.industry}）`, peers: r.peers.map((p) => `${p.customer.short_name}（類似度 ${(p.similarity * 100).toFixed(0)}%）`), candidates: r.candidates.map((x) => ({ product: `${x.product.code} ${x.product.name}`, category: x.product.category, reference_price: x.reference_price, best_cost: x.best_cost, reason: x.reason, evidence: x.peers.slice(0, 3).map((e) => `${e.customer.short_name}: 累計${e.total_qty}${x.product.unit} 直近${e.last_date.slice(0, 10)} ${yen(e.last_price)}`) })) });
});

server.registerTool("lost_reasons", {
  title: "失注理由の集計",
  description: "失注理由ごとの件数・金額を返す。",
  inputSchema: {},
}, async () => text(lostReasonStats(db)));

server.registerTool("log_call", {
  title: "電話メモを記録して処理",
  description: "電話の内容（口頭メモ）を記録し、議事録・依頼事項に構造化して、価格回答・納期回答・見積り下書きなどを実行し、得意先宛ての確認メールを下書きする。口頭のミス・漏れを無くすための機能。",
  inputSchema: {
    memo: z.string().describe("電話の内容（話し言葉のままで可）"),
    customer: z.string().optional().describe("得意先コード・社名・電話番号"),
    direction: z.enum(["in", "out", "unknown"]).optional(),
  },
}, async ({ memo, customer, direction }) => {
  let cust = null;
  if (customer) cust = findCustomerByTel(db, customer) ?? resolveCustomer(customer);
  const call = createCall(db, { customer_id: cust?.id ?? null, tel: cust?.tel ?? null, direction: direction ?? "unknown", memo, source: "mcp" });
  if (!hasApiKey()) return text({ id: call.id, note: "API キー未設定のため記録のみ。Web の電話メモ画面から処理してください。" });
  const minutes = await structureCallMemo({ memo, customer: cust, recentQuotes: cust ? listQuotes(db, { customerId: cust.id, limit: 6 }) : [], today: today(), started_at: call.started_at });
  const executed = executeCallRequests(db, call, minutes);
  const mail = await composeCallConfirmation(call, executed, getSettings(db), today());
  updateCall(db, call.id, { minutes_json: JSON.stringify(executed), mail_subject: mail.subject, mail_body: mail.body, status: "processed" });
  const link = await attachCallToDeal(db, call.id, { adjudicate: adjudicateDealLink });
  if (link) await refreshDealSummary(db, link.deal.id);
  return text({
    call_id: call.id, customer: cust?.name ?? null, deal: link ? { id: link.deal.id, title: link.deal.title, created: link.created } : null, summary: executed.summary,
    requests: executed.requests.map((r) => ({ kind: CALL_REQUEST_LABEL[r.kind], detail: r.detail, result: r.result })),
    promises: executed.promises, rep_todos: executed.rep_todos, confirmation_mail: mail, url: `http://localhost:3000/calls/${call.id}`,
  });
});

server.registerTool("list_calls", {
  title: "電話メモ一覧",
  description: "最近の通話記録（メモ未入力・処理済）を返す。",
  inputSchema: { limit: z.number().int().positive().max(100).optional() },
}, async ({ limit }) => text(listCalls(db, { limit: limit ?? 20 }).map((c) => ({ id: c.id, customer: c.customer?.short_name ?? c.tel, started_at: c.started_at, status: c.status, summary: c.minutes?.summary.split("\n")[0] ?? c.memo.slice(0, 60), needs_human: c.minutes?.requests.filter((r) => r.result?.status === "needs_human").map((r) => r.result!.headline) ?? [] }))));

server.registerTool("list_deals", {
  title: "案件一覧",
  description: "案件（得意先×ひとつの話）を一覧する。状態・次の一手・期限・金額付き。得意先や担当者で絞り込める。",
  inputSchema: { customer: z.string().optional(), open_only: z.boolean().optional().describe("進行中のみ（既定 true）"), limit: z.number().int().positive().max(100).optional() },
}, async ({ customer, open_only, limit }) => {
  const c = customer ? resolveCustomer(customer) : null;
  return text(listDeals(db, { customerId: c?.id, openOnly: open_only ?? true, limit: limit ?? 30 }).map((d) => ({ id: d.id, customer: d.customer.short_name, contact: d.contact?.name ?? null, end_customer: d.end_customer?.name ?? null, title: d.title, status: DEAL_STATUS_LABEL[d.status], amount: Math.round(d.amount), next_action: d.next_action, next_action_due: d.next_action_due, last_activity: d.last_activity_at.slice(0, 10), summary: d.summary })));
});

server.registerTool("get_deal", {
  title: "案件の詳細",
  description: "案件の経緯（3 行要約と詳細）、次の一手、時系列（電話・見積り・フォロー・メール・引継ぎ）を返す。",
  inputSchema: { deal_id: z.number().int() },
}, async ({ deal_id }) => {
  const d = getDeal(db, deal_id);
  if (!d) throw new Error(`案件 ${deal_id} が見つかりません`);
  return text({ ...d, status_label: DEAL_STATUS_LABEL[d.status], timeline: dealTimeline(db, deal_id).map((t) => `${t.at.slice(0, 16)} [${t.title}] ${t.body}`) });
});

server.registerTool("refresh_deal", {
  title: "案件の要約を更新",
  description: "案件の「ここまでの経緯と今の状況」「次の一手」を時系列から書き直す。",
  inputSchema: { deal_id: z.number().int() },
}, async ({ deal_id }) => text(await refreshDealSummary(db, deal_id)));

server.registerTool("list_contacts", {
  title: "得意先の担当者一覧",
  description: "得意先の担当者（在籍・異動・退職）と連絡先を返す。",
  inputSchema: { customer: z.string() },
}, async ({ customer }) => { const c = resolveCustomer(customer); return text(listContacts(db, c.id, { includeInactive: true }).map((k) => ({ id: k.id, name: k.name, department: k.department, title: k.title, status: CONTACT_STATUS_LABEL[k.status], tel: k.tel, mobile: k.mobile, email: k.email, notes: k.notes }))); });

server.registerTool("handover_customer", {
  title: "得意先の担当を引き継ぐ",
  description: "得意先の担当を別の自社ユーザーへ引き継ぐ。引継ぎ書を保存し、進行中の案件に『ここまでは前回の担当者〇〇』を記録する。dry_run=true なら引継ぎ書の内容だけ返す。",
  inputSchema: { customer: z.string(), to_user: z.string().optional().describe("引継ぎ先ユーザー名"), note: z.string().optional(), dry_run: z.boolean().optional() },
}, async ({ customer, to_user, note, dry_run }) => {
  const c = resolveCustomer(customer);
  if (dry_run || !to_user) return text(handoverFacts(db, c.id));
  const u = listUsers(db).find((x) => x.name.replace(/\s/g, "").includes(to_user.replace(/\s/g, "")));
  if (!u) throw new Error(`ユーザー「${to_user}」が見つかりません: ${listUsers(db).map((x) => x.name).join(" / ")}`);
  const rec = handoverCustomer(db, c.id, u.id, { note });
  return text({ ok: true, customer: c.name, to: u.name, handed_at: rec.handed_at, handover_doc_chars: rec.handover_doc.length });
});

server.registerTool("keijo_check", {
  title: "伝票計上の指示と整合チェック",
  description: "受注見積りから計上指示（得意先コード・商品コード・仕入れ先コード・単価・納期）を作り、見積りや過去単価との差異を列挙する。Web の見積り詳細から Excel も出せる。",
  inputSchema: { quote_no: z.string() },
}, async ({ quote_no }) => { const q = getQuoteByNo(db, quote_no); if (!q) throw new Error("見積りが見つかりません"); const k = buildKeijo(db, q.id, getSettings(db)); return text({ quote_no, customer_code: k.customer_code, flags: k.flags, rows: k.rows, total_sell: k.total_sell, total_cost: k.total_cost, excel_url: `http://localhost:3000/api/quotes/${q.id}/keijo` }); });

server.registerTool("delivery_waiting", {
  title: "納期回答待ちの一覧",
  description: "仕入れ先の納期回答が無い見積り明細を返す。",
  inputSchema: {},
}, async () => text(deliveryWaitingList(db).map((w) => ({ quote_no: w.quote.quote_no, customer: w.quote.customer.short_name, requested_delivery: w.quote.requested_delivery, overdue: w.overdue, items: w.waiting_items.map((it) => ({ item_id: it.id, description: it.description, qty: it.qty, supplier: it.supplier?.name ?? null })) }))));

server.registerTool("record_delivery", {
  title: "納期回答を記録",
  description: "仕入れ先からの納期回答を明細に記録する。全明細が揃うと回答納期が見積りに入り、得意先向けの納期連絡文を返す。",
  inputSchema: { quote_no: z.string(), item_id: z.number().int(), supplier_delivery: z.string().describe("YYYY-MM-DD"), note: z.string().optional() },
}, async ({ quote_no, item_id, supplier_delivery, note }) => { const q = getQuoteByNo(db, quote_no); if (!q) throw new Error("見積りが見つかりません"); const r = recordSupplierDelivery(db, q.id, item_id, supplier_delivery, note); const s = getSettings(db); return text({ promised_delivery: r.promised_delivery, notice: r.promised_delivery ? deliveryNotice(r, s.company_name, s.sales_rep) : null }); });

server.registerTool("price_impact", {
  title: "価格改定の影響一覧",
  description: "現在の仕入れ値（または値上げシミュレーション）で、直近の受注単価だと粗利下限を割る得意先×商品を、取り戻すべき額の大きい順に返す。",
  inputSchema: { pct: z.number().optional().describe("仕入れ値の上昇率 %（省略時は現状）"), supplier: z.string().optional(), category: z.string().optional() },
}, async ({ pct, supplier, category }) => {
  const sid = supplier ? listSuppliers(db).find((s) => s.name.includes(supplier))?.id ?? null : null;
  const r = priceImpact(db, pct ? { pct, supplier_id: sid, category: category ?? null } : null);
  return text(r.rows.filter((x) => pct || x.level !== "ok").slice(0, 50).map((x) => ({ customer: x.customer.short_name, product: x.product.name, last_price: x.last_price, cost_before: x.cost_before, cost_now: x.cost_now, margin_before: x.margin_before, margin_now: x.margin_now, needed_price: x.needed_price, gap_amount: x.gap_amount, level: x.level })));
});

server.registerTool("daily_report", {
  title: "営業日報の下書き",
  description: "指定日（省略時は今日）の電話・見積り・フォロー・受注失注・案件の動きから日報の下書きを返す。",
  inputSchema: { date: z.string().optional().describe("YYYY-MM-DD"), user: z.string().optional().describe("自社ユーザー名（省略時は全員）") },
}, async ({ date, user }) => { const u = user ? listUsers(db, { includeInactive: true }).find((x) => x.name.includes(user)) : null; return text(reportDraft(reportFacts(db, date ?? today(), u?.id ?? null))); });

server.registerTool("visit_brief", {
  title: "訪問前ブリーフ",
  description: "訪問直前に読む 1 ページ：担当者、進行中の案件と次の一手、直近の電話、返事待ちの見積り、定番品、横展開候補、前任者の申し送り。",
  inputSchema: { customer: z.string() },
}, async ({ customer }) => { const c = resolveCustomer(customer); return text(visitBrief(db, c.id)); });

const transport = new StdioServerTransport();
await server.connect(transport);
