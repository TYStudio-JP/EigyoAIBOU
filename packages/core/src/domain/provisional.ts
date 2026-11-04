/**
 * 暫定回答（電話・SMS・LINE・メール本文で単価を先に伝える）と「正式未送付」の追跡。
 * 外出先で口頭回答したことを必ず残し、帰社後の正式見積書と自動で突き合わせる。
 */
import type { Db } from "../db/connection";
import { PROVISIONAL_CHANNEL_LABEL, type ProvisionalChannel, type QuoteWithItems, type Settings } from "./types";
import { addActivity, getQuote, listQuotes, nowStamp, type QuoteSummary } from "./repo";

export interface ProvisionalSnapshotItem { description: string; qty: number; unit: string; unit_price: number }

const jp = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).replace(/-/g, "/") : null);
const yen = (n: number) => `${Math.round(n).toLocaleString("ja-JP")}円`;

/** SMS・LINE・口頭用の短い暫定回答文（決定的テンプレート。数字は見積りの値のみ）。 */
export function provisionalText(q: QuoteWithItems, settings: Settings, channel: ProvisionalChannel = "sms"): string {
  const rep = settings.sales_rep.split(" ").pop() ?? settings.sales_rep;
  const greeting = channel === "phone" ? "（電話で伝える内容）" : `${q.customer.contact_name ? q.customer.contact_name + " 様" : "ご担当者様"}\nお世話になっております。${settings.company_name}の${rep}です。`;
  const lines = q.items.map((it) => `・${it.description} ${it.qty}${it.unit}：@${yen(it.unit_price)}${it.supplier_delivery ? `（納期 ${jp(it.supplier_delivery)}）` : ""}`);
  const delivery = q.promised_delivery ? `納期：${jp(q.promised_delivery)} 予定` : q.requested_delivery ? `納期：ご希望 ${jp(q.requested_delivery)} で確認中` : "納期：確認中";
  const valid = q.valid_until ? `有効期限：${jp(q.valid_until)}` : "";
  return [
    greeting,
    `「${q.subject}」の暫定のご回答です。`,
    ...lines,
    `小計 ${yen(q.total)}（税抜）`,
    delivery,
    valid,
    "正式なお見積書は追ってお送りします。",
    channel === "phone" ? "" : `${settings.company_name} ${rep}`,
  ].filter(Boolean).join("\n");
}

/** 暫定回答を記録する。下書きなら提出済へ進め、明細のスナップショットを保存する。 */
export function markProvisional(db: Db, quoteId: number, opts: { channel: ProvisionalChannel; text?: string; at?: string }): QuoteWithItems {
  const q = getQuote(db, quoteId);
  if (!q) throw new Error(`quote ${quoteId} not found`);
  const at = opts.at ?? nowStamp();
  const snapshot: ProvisionalSnapshotItem[] = q.items.map((it) => ({ description: it.description, qty: it.qty, unit: it.unit, unit_price: it.unit_price }));
  const status = q.status === "draft" ? "submitted" : q.status;
  const submitted_at = q.submitted_at ?? at;
  db.prepare(
    "UPDATE quotes SET status=?, submitted_at=?, provisional_at=?, provisional_channel=?, provisional_text=?, provisional_items_json=?, formal_sent_at=NULL, updated_at=? WHERE id=?",
  ).run(status, submitted_at, at, opts.channel, opts.text ?? null, JSON.stringify(snapshot), at, quoteId);
  if (q.status === "draft") addActivity(db, quoteId, "status", "ステータス → 提出済（暫定回答）", at);
  addActivity(db, quoteId, "followup", `暫定回答（${PROVISIONAL_CHANNEL_LABEL[opts.channel]}）：${snapshot.map((s) => `${s.description} @${yen(s.unit_price)}`).join(" / ")}。正式見積書は未送付`, at);
  return getQuote(db, quoteId)!;
}

/** 正式見積書を送った（または送る必要が無くなった）ことを記録する。 */
export function markFormalSent(db: Db, quoteId: number, opts: { at?: string; note?: string } = {}): QuoteWithItems {
  const at = opts.at ?? nowStamp();
  db.prepare("UPDATE quotes SET formal_sent_at=?, updated_at=? WHERE id=?").run(at, at, quoteId);
  addActivity(db, quoteId, "followup", `正式見積書を送付${opts.note ? `：${opts.note}` : ""}`, at);
  return getQuote(db, quoteId)!;
}

export interface FormalDiff { changed: boolean; lines: string[] }
/** 暫定回答した内容と現在の明細の差（口頭で伝えた単価・数量と違う箇所を赤で出すため）。 */
export function formalDiff(q: QuoteWithItems): FormalDiff {
  if (!q.provisional_items_json) return { changed: false, lines: [] };
  let snap: ProvisionalSnapshotItem[] = [];
  try { snap = JSON.parse(q.provisional_items_json) as ProvisionalSnapshotItem[]; } catch { return { changed: false, lines: [] }; }
  const lines: string[] = [];
  const left = [...snap];
  for (const it of q.items) {
    const i = left.findIndex((s) => s.description === it.description);
    if (i < 0) { lines.push(`追加：${it.description} ${it.qty}${it.unit} @${yen(it.unit_price)}（暫定回答には無かった明細）`); continue; }
    const s = left.splice(i, 1)[0];
    if (Math.round(s.unit_price) !== Math.round(it.unit_price)) lines.push(`単価変更：${it.description} ${yen(s.unit_price)} → ${yen(it.unit_price)}（口頭で伝えた単価と違います）`);
    if (s.qty !== it.qty) lines.push(`数量変更：${it.description} ${s.qty}${s.unit} → ${it.qty}${it.unit}`);
  }
  for (const s of left) lines.push(`削除：${s.description} ${s.qty}${s.unit} @${yen(s.unit_price)}（暫定回答で伝えたが今の明細に無い）`);
  return { changed: lines.length > 0, lines };
}

/** 正式未送付（暫定回答済みで、正式見積書をまだ送っていない）の見積り。古い順。 */
export function pendingFormalList(db: Db): QuoteSummary[] {
  return listQuotes(db, { status: ["submitted", "tracking", "won"], limit: 500 })
    .filter((q) => q.provisional_at && !q.formal_sent_at)
    .sort((a, b) => (a.provisional_at ?? "").localeCompare(b.provisional_at ?? ""));
}
export const isPendingFormal = (q: Pick<QuoteSummary, "provisional_at" | "formal_sent_at">): boolean => Boolean(q.provisional_at && !q.formal_sent_at);
