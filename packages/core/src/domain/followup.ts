import type { Db } from "../db/connection";
import { daysBetween, getSettings, listQuotes, today, type QuoteSummary } from "./repo";

export interface FollowupItem {
  quote: QuoteSummary;
  days_since_submit: number;
  days_since_last_touch: number;
  urgency: "overdue" | "due" | "soon" | "fresh";
  suggestion: string;
}

/** 提出済・追跡中の見積りから「そろそろ確認すべき案件」を抽出する。 */
export function followupQueue(db: Db, asOf: string = today()): FollowupItem[] {
  const s = getSettings(db);
  const open = listQuotes(db, { status: ["submitted", "tracking"], limit: 500 });
  return open
    .map((q) => {
      const submitted = (q.submitted_at ?? q.created_at).slice(0, 10);
      const lastTouch = (q.last_followup_at ?? q.submitted_at ?? q.created_at).slice(0, 10);
      const sinceSubmit = daysBetween(submitted, asOf);
      const sinceTouch = daysBetween(lastTouch, asOf);
      const threshold = q.last_followup_at ? s.followup_days_repeat : s.followup_days_first;
      let urgency: FollowupItem["urgency"] = "fresh";
      if (sinceTouch >= threshold * 2) urgency = "overdue";
      else if (sinceTouch >= threshold) urgency = "due";
      else if (sinceTouch >= threshold - 1) urgency = "soon";
      const expired = q.valid_until && q.valid_until < asOf;
      let suggestion: string;
      if (expired) suggestion = "見積り有効期限切れ。再見積りの要否を確認";
      else if (!q.last_followup_at) suggestion = `提出から${sinceSubmit}日。検討状況と競合の有無をヒアリング`;
      else if (sinceSubmit >= 30) suggestion = `提出から${sinceSubmit}日経過。案件が生きているか確認し、消滅なら失注理由を記録`;
      else suggestion = `前回フォローから${sinceTouch}日。納期・数量に変更がないか確認`;
      return { quote: q, days_since_submit: sinceSubmit, days_since_last_touch: sinceTouch, urgency, suggestion };
    })
    .sort((a, b) => {
      const o = { overdue: 0, due: 1, soon: 2, fresh: 3 };
      return o[a.urgency] - o[b.urgency] || b.quote.total - a.quote.total;
    });
}

/** 失注理由の集計（次回提案へのフィードバック用）。 */
export function lostReasonStats(db: Db): { reason: string; count: number; amount: number }[] {
  const rows = db
    .prepare(
      `SELECT COALESCE(lost_reason,'other') AS reason, COUNT(*) AS count,
              COALESCE(SUM((SELECT SUM(qty*unit_price) FROM quote_items WHERE quote_id=q.id)),0) AS amount
       FROM quotes q WHERE status='lost' GROUP BY reason ORDER BY count DESC`,
    )
    .all() as unknown as { reason: string; count: number; amount: number }[];
  return rows.map((r) => ({ ...r }));
}
