import type { Db } from "../db/connection";
import type { CallMinutes, CallRequest, CallRequestResult, CallWithCustomer } from "./types";
import { ROUTE_LABEL } from "./types";
import { addActivity, addDays, createQuote, currentSupplierPrices, findProducts, getQuoteByNo, getSettings, listQuotes, today, type NewQuoteItem } from "./repo";
import { checkPrice, proposePrice, round } from "./pricing";

const yen = (n: number | null | undefined) => (n == null ? "-" : `${round(n).toLocaleString("ja-JP")}円`);

/** 依頼事項を種類ごとに「決定的なロジック」で実行し、結果を付けて返す。価格は AI に計算させない。 */
export function executeCallRequests(db: Db, call: CallWithCustomer, minutes: CallMinutes): CallMinutes {
  const customer = call.customer;
  const requests = minutes.requests.map((r): CallRequest => ({ ...r, result: run(db, call, r) }));
  // 見積り依頼が複数明細に散っている場合は 1 件の見積りにまとめる
  return { ...minutes, requests };

  function run(db: Db, call: CallWithCustomer, r: CallRequest): CallRequestResult {
    try {
      switch (r.kind) {
        case "price": return priceAnswer(db, call, r);
        case "delivery": return deliveryAnswer(db, call, r);
        case "product_inquiry": return productAnswer(db, r);
        case "quote_request": return quoteDraft(db, call, r);
        case "quantity_change": return quantityChange(db, call, r);
        case "complaint": return { status: "needs_human", headline: "担当者から折り返し対応", detail: `内容: ${r.detail}。状況確認のうえ、本日中に折り返す。` };
        default: return { status: "needs_human", headline: "担当者が対応", detail: r.detail };
      }
    } catch (e) {
      return { status: "needs_human", headline: "自動処理できず（担当確認）", detail: e instanceof Error ? e.message : String(e) };
    }
  }
  void customer;
}

function product(db: Db, q: string | null) {
  if (!q) return null;
  return findProducts(db, q, 1)[0] ?? null;
}

function priceAnswer(db: Db, call: CallWithCustomer, r: CallRequest): CallRequestResult {
  const p = product(db, r.product_query);
  if (!p) return { status: "needs_human", headline: "商品を特定できず（要確認）", detail: `「${r.product_query ?? r.detail}」が商品マスタに見つかりません。品番を確認してください。` };
  if (!call.customer) return { status: "needs_human", headline: "得意先未特定のため価格回答保留", detail: "得意先を選んでから再処理してください。" };
  const qty = r.qty ?? 1;
  const prop = proposePrice(db, p.id, call.customer.id, qty);
  const settings = getSettings(db);
  const price = prop.proposed_price;
  const parts = [`${p.name} × ${qty}${p.unit}: 提案単価 ${yen(price)}`];
  if (prop.last_same_customer) parts.push(`前回 ${yen(prop.last_same_customer.unit_price)}（${prop.last_same_customer.date.slice(0, 10)}）`);
  parts.push(`値引き下限 ${yen(prop.floor_price)}`);
  if (r.asked_price != null) {
    const checks = checkPrice(prop, r.asked_price, prop.best_cost ?? 0, prop.best_supplier_id, settings);
    const bad = checks.filter((c) => c.level === "danger" || c.level === "warn");
    if (prop.floor_price != null && r.asked_price < prop.floor_price) {
      return { status: "needs_human", headline: `希望 ${yen(r.asked_price)} は値引き下限 ${yen(prop.floor_price)} を下回る`, detail: `${parts.join(" / ")}。${bad.map((c) => c.title).join("・")}。上長確認または数量条件の提示が必要。`, product_code: p.code };
    }
    return { status: "done", headline: `${p.name}: 希望 ${yen(r.asked_price)} で対応可能（粗利 ${round(((r.asked_price - (prop.best_cost ?? 0)) / r.asked_price) * 100, 1)}%）`, detail: `${parts.join(" / ")}。${bad.length ? "注意: " + bad.map((c) => c.title).join("・") : "警告なし"}`, product_code: p.code };
  }
  return { status: "done", headline: `${p.name}: ${yen(price)}/${p.unit} で回答可`, detail: `${parts.join(" / ")}。根拠: ${prop.proposal_basis}`, product_code: p.code };
}

function deliveryAnswer(db: Db, call: CallWithCustomer, r: CallRequest): CallRequestResult {
  const p = product(db, r.product_query);
  if (!p) return { status: "needs_human", headline: "商品を特定できず（要確認）", detail: `「${r.product_query ?? r.detail}」が見つかりません。` };
  const routes = currentSupplierPrices(db, p.id);
  if (!routes.length) return { status: "needs_human", headline: `${p.name}: 仕入れ先に納期確認`, detail: "仕入れ情報が未登録。問い合わせメールの下書きを使ってください。", product_code: p.code };
  const qty = r.qty ?? 1;
  const feasible = routes.filter((o) => qty >= o.min_lot);
  const fastest = [...(feasible.length ? feasible : routes)].sort((a, b) => (a.lead_time_days ?? 99) - (b.lead_time_days ?? 99))[0];
  const eta = addDays(today(), (fastest.lead_time_days ?? 7) + 1);
  const cheapest = routes[0];
  let detail = `最短: ${fastest.supplier_name}（${ROUTE_LABEL[fastest.route_type]}）${fastest.lead_time_days ?? "-"}日 → ${eta} 納品目安`;
  if (cheapest.supplier_id !== fastest.supplier_id) detail += `。最安: ${cheapest.supplier_name} ${cheapest.lead_time_days ?? "-"}日（${yen(cheapest.cost)}、最短ルートより ${yen(fastest.cost - cheapest.cost)} 安い）`;
  if (r.requested_delivery && r.requested_delivery < eta) {
    return { status: "needs_human", headline: `${p.name}: 希望納期 ${r.requested_delivery} は最短 ${eta} に間に合わない見込み`, detail: `${detail}。仕入れ先に在庫・特急の可否を問い合わせる（下書きを作成可）。`, product_code: p.code };
  }
  return { status: "done", headline: `${p.name}: ${eta} 頃に納品可能（最短 ${fastest.lead_time_days ?? "-"}日）`, detail, product_code: p.code };
}

function productAnswer(db: Db, r: CallRequest): CallRequestResult {
  const p = product(db, r.product_query);
  if (!p) return { status: "needs_human", headline: "商品を特定できず（メーカーに確認）", detail: `「${r.product_query ?? r.detail}」が見つかりません。仕入れ先問い合わせの下書きを使ってください。` };
  const routes = currentSupplierPrices(db, p.id);
  return { status: "done", headline: `${p.name}（${p.maker} ${p.part_number}）: ${p.spec || "仕様はカタログ参照"}`, detail: `定価 ${yen(p.list_price)}/${p.unit}。取扱ルート: ${routes.map((o) => `${o.supplier_name} ${o.lead_time_days ?? "-"}日`).join(" / ") || "未登録"}`, product_code: p.code };
}

function quoteDraft(db: Db, call: CallWithCustomer, r: CallRequest): CallRequestResult {
  if (!call.customer) return { status: "needs_human", headline: "得意先未特定のため見積り保留", detail: "得意先を選んでから再処理してください。" };
  const specs = r.items.length ? r.items : r.product_query ? [{ product_query: r.product_query, qty: r.qty ?? 1 }] : [];
  if (!specs.length) return { status: "needs_human", headline: "見積り依頼の明細が不明", detail: r.detail };
  const missing: string[] = [];
  const items: NewQuoteItem[] = [];
  for (const sp of specs) {
    const p = findProducts(db, sp.product_query, 1)[0];
    if (!p) { missing.push(sp.product_query); items.push({ product_id: null, description: sp.product_query, qty: sp.qty, unit: "個", unit_price: 0, cost: 0, supplier_id: null, remarks: "未登録品：要確認" }); continue; }
    const prop = proposePrice(db, p.id, call.customer.id, sp.qty);
    items.push({ product_id: p.id, description: `${p.name}（${p.part_number}）`, qty: sp.qty, unit: p.unit, unit_price: prop.proposed_price, cost: prop.best_cost ?? 0, supplier_id: prop.best_supplier_id, remarks: "" });
  }
  const q = createQuote(db, { customer_id: call.customer.id, subject: `${today().slice(0, 7).replace("-", "年")}月 電話依頼分`, items, requested_delivery: r.requested_delivery ?? null, source_type: "call", source_text: call.memo, notes: "" });
  addActivity(db, q.id, "note", `電話メモ #${call.id} から自動作成`);
  return { status: missing.length ? "needs_human" : "done", headline: `見積り ${q.quote_no} を下書き（${items.length} 明細・${yen(q.total)}）`, detail: missing.length ? `未登録品あり: ${missing.join("、")}。単価を確認して提出してください。` : "単価は履歴に基づく提案値。確認のうえ提出。", quote_id: q.id, quote_no: q.quote_no };
}

function quantityChange(db: Db, call: CallWithCustomer, r: CallRequest): CallRequestResult {
  let q = r.quote_no ? getQuoteByNo(db, r.quote_no) : null;
  if (!q && call.customer) {
    const open = listQuotes(db, { customerId: call.customer.id, status: ["submitted", "tracking", "draft"], limit: 1 });
    q = open[0] ? getQuoteByNo(db, open[0].quote_no) : null;
  }
  if (!q) return { status: "needs_human", headline: "対象の見積りを特定できず", detail: r.detail };
  addActivity(db, q.id, "note", `電話で変更依頼: ${r.detail}`);
  return { status: "needs_human", headline: `見積り ${q.quote_no} の変更依頼を記録（明細の修正は担当者）`, detail: r.detail, quote_id: q.id, quote_no: q.quote_no };
}
