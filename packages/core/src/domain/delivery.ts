import type { Db } from "../db/connection";
import type { QuoteWithItems } from "./types";
import { addActivity, addDays, getQuote, listQuotes, setDeliveryKind, today, updateQuoteHeader } from "./repo";
import { DELIVERY_KIND_LABEL, type DeliveryKind } from "./types";

/** 回答納期を「概算（注文前）」「確定（注文後）」に切り替える。 */
export function markDeliveryKind(db: Db, quoteId: number, kind: DeliveryKind, note?: string): QuoteWithItems {
  setDeliveryKind(db, quoteId, kind);
  addActivity(db, quoteId, "note", `回答納期を${DELIVERY_KIND_LABEL[kind]}に${note ? `：${note}` : ""}`);
  return getQuote(db, quoteId)!;
}

/** 納期回答待ち：決着していない見積りのうち、仕入れ先の納期回答が無い明細があるもの。 */
export interface DeliveryWaiting { quote: QuoteWithItems; waiting_items: QuoteWithItems["items"]; overdue: boolean }
export function deliveryWaitingList(db: Db): DeliveryWaiting[] {
  const t = today();
  return listQuotes(db, { status: ["draft", "submitted", "tracking"], limit: 500 })
    .map((q) => getQuote(db, q.id)!)
    .map((q) => ({ quote: q, waiting_items: q.items.filter((it) => it.product_id && !it.supplier_delivery), overdue: Boolean(q.requested_delivery && q.requested_delivery < addDays(t, 7)) }))
    .filter((x) => x.waiting_items.length > 0)
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || (a.quote.requested_delivery ?? "9999").localeCompare(b.quote.requested_delivery ?? "9999"));
}

/** 仕入れ先からの納期回答を明細に記録し、全明細が揃ったら回答納期（最も遅い回答＋1 日）を見積りに反映する。 */
export function recordSupplierDelivery(db: Db, quoteId: number, itemId: number, supplierDelivery: string | null, note?: string): QuoteWithItems {
  db.prepare("UPDATE quote_items SET supplier_delivery=? WHERE id=? AND quote_id=?").run(supplierDelivery, itemId, quoteId);
  const q = getQuote(db, quoteId)!;
  const it = q.items.find((x) => x.id === itemId);
  addActivity(db, quoteId, "note", `納期回答: ${it?.description ?? ""} → ${supplierDelivery ?? "未定"}${note ? `（${note}）` : ""}`);
  const dated = q.items.filter((x) => x.product_id).map((x) => x.supplier_delivery).filter((d): d is string => Boolean(d));
  if (dated.length && q.items.filter((x) => x.product_id).every((x) => x.supplier_delivery)) {
    const promised = addDays(dated.sort().pop()!, 1);
    updateQuoteHeader(db, quoteId, { promised_delivery: promised });
    // 受注後に全明細の回答が揃ったら「確定納期」。注文前は概算のまま（人が切り替えられる）
    if (q.status === "won" && q.delivery_kind !== "confirmed") markDeliveryKind(db, quoteId, "confirmed", "受注後に仕入れ先の回答が全明細そろったため");
  }
  return getQuote(db, quoteId)!;
}

/** 得意先向けの納期連絡文（決定的テンプレート。AI 不要）。 */
export function deliveryNotice(q: QuoteWithItems, company: string, rep: string): { subject: string; body: string; late: boolean } {
  const late = Boolean(q.requested_delivery && q.promised_delivery && q.promised_delivery > q.requested_delivery);
  const lines = q.items.map((it) => `・${it.description} × ${it.qty}${it.unit}：${it.supplier_delivery ? `${it.supplier_delivery.replace(/-/g, "/")} 納品予定` : "納期確認中"}`);
  const body = `${q.customer.name}\n${q.customer.contact_name ? q.customer.contact_name + " 様" : "ご担当者様"}\n\nいつもお世話になっております。${company} ${rep.split(" ").pop()}です。\nお見積り ${q.quote_no}「${q.subject}」の納期についてご連絡いたします。\n\n${lines.join("\n")}\n\n${q.promised_delivery ? `全数の納品予定は ${q.promised_delivery.replace(/-/g, "/")} です。` : ""}${late ? `\nご希望の ${q.requested_delivery!.replace(/-/g, "/")} に間に合わず申し訳ございません。分納や代替品のご提案も可能ですので、ご都合をお聞かせください。` : q.requested_delivery ? `\nご希望の ${q.requested_delivery.replace(/-/g, "/")} に間に合う見込みです。` : ""}\n\nよろしくお願いいたします。\n\n${company} ${rep}`;
  return { subject: `【納期のご連絡】${q.subject}（${q.quote_no}）`, body, late };
}
