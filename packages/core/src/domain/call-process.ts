/**
 * 電話メモの処理（議事録・依頼の実行・確認メール・案件への紐づけ）を一本にまとめ、
 * 画面を離れても裏で続けられるように「実行中／キャンセル要求」を calls.process_state に持つ。
 *
 * - startCallProcess → 実行中にする（二重起動を防ぐ）
 * - runCallProcess   → 裏で動かす本体。終われば process_state を消し、失敗なら process_error に残す
 * - requestCallCancel → キャンセル要求。議事録の構造化（最初の AI 呼び出し）が終わった時点で確認し、
 *                       要求があれば何も書かずに終わる。依頼の実行（見積り作成など）に入った後は最後まで進める。
 */
import type { Db } from "../db/connection";
import { findContactByName, getCall, getSettings, listQuotes, today, updateCall } from "./repo";
import { executeCallRequests } from "./call-actions";
import { attachCallToDeal, type LinkDecision } from "./deals";
import { refreshDealSummary } from "./deal-refresh";
import { composeCallConfirmation, structureCallMemo } from "../ai/call";
import { adjudicateDealLink } from "../ai/deals";
import { hasApiKey } from "../ai/client";
import type { CallWithCustomer } from "./types";

export class CallProcessCancelled extends Error {
  constructor() { super("キャンセルしました"); this.name = "CallProcessCancelled"; }
}

/** 実行中にする。すでに実行中なら false（二重起動しない）。 */
export function startCallProcess(db: Db, id: number): boolean {
  const c = getCall(db, id);
  if (!c) throw new Error("not found");
  if (c.process_state === "running" || c.process_state === "cancel") return false;
  updateCall(db, id, { process_state: "running", process_error: null });
  return true;
}

/** キャンセル要求。実行中でなければ何もしない。 */
export function requestCallCancel(db: Db, id: number): void {
  const c = getCall(db, id);
  if (c?.process_state === "running") updateCall(db, id, { process_state: "cancel" });
}

export function isCallProcessing(c: { process_state: string | null } | null | undefined): boolean {
  return c?.process_state === "running" || c?.process_state === "cancel";
}

/** 電話メモ → 議事録・依頼の構造化（Claude）→ 依頼の実行（決定的）→ 確認メール（Claude）→ 案件に紐づけ。 */
export async function processCall(db: Db, id: number, opts: { today?: string; checkCancel?: boolean } = {}): Promise<{ call: CallWithCustomer; link: LinkDecision | null }> {
  const call = getCall(db, id);
  if (!call) throw new Error("not found");
  if (!call.memo.trim()) throw new Error("電話メモが空です");
  const t = opts.today ?? today();
  const recent = call.customer ? listQuotes(db, { customerId: call.customer.id, limit: 6 }) : [];
  const minutes = await structureCallMemo({ memo: call.memo, customer: call.customer, recentQuotes: recent, today: t, started_at: call.started_at });
  if (opts.checkCancel && getCall(db, id)?.process_state === "cancel") throw new CallProcessCancelled();
  // 相手の名前から担当者を自動特定（未設定のときだけ）
  if (!call.contact_id && call.customer && minutes.counterpart) {
    const hit = findContactByName(db, call.customer.id, minutes.counterpart.split(/[\s　(（]/)[0]);
    if (hit) updateCall(db, id, { contact_id: hit.id });
  }
  const fresh = getCall(db, id)!;
  const executed = executeCallRequests(db, fresh, minutes);
  const mail = await composeCallConfirmation(fresh, executed, getSettings(db), t);
  updateCall(db, id, { minutes_json: JSON.stringify(executed), mail_subject: mail.subject, mail_body: mail.body, status: "processed" });
  const link = await attachCallToDeal(db, id, { adjudicate: hasApiKey() ? adjudicateDealLink : undefined });
  if (link) await refreshDealSummary(db, link.deal.id);
  return { call: getCall(db, id)!, link };
}

/** 裏で動かす本体。必ず process_state を片付けて終わる。 */
export async function runCallProcess(db: Db, id: number): Promise<void> {
  try {
    await processCall(db, id, { checkCancel: true });
    updateCall(db, id, { process_state: null, process_error: null });
  } catch (e) {
    if (e instanceof CallProcessCancelled) { updateCall(db, id, { process_state: null, process_error: null }); return; }
    console.error("[call-process]", e instanceof Error ? e.message : e);
    updateCall(db, id, { process_state: null, process_error: e instanceof Error ? e.message : String(e) });
  }
}
