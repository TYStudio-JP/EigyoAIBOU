import type { Db } from "../db/connection";
import { dealTimeline, fallbackDealSummary } from "./deals";
import { addDealEvent, getDeal, today, updateDeal } from "./repo";
import { hasApiKey } from "../ai/client";
import { writeDealSummary } from "../ai/deals";
import type { DealWithRefs } from "./types";

/** 案件の「ここまでの経緯と今の状況」を更新する。AI があれば AI、無ければ決定的な要約。 */
export async function refreshDealSummary(db: Db, dealId: number, opts: { useAi?: boolean } = {}): Promise<DealWithRefs> {
  const deal = getDeal(db, dealId);
  if (!deal) throw new Error("deal not found");
  const useAi = opts.useAi ?? hasApiKey();
  if (useAi) {
    try {
      const out = await writeDealSummary(deal, dealTimeline(db, dealId), today());
      updateDeal(db, dealId, { summary: out.summary, summary_detail: out.summary_detail + (out.risk ? `\n\n⚠ リスク: ${out.risk}` : ""), next_action: out.next_action, next_action_due: out.next_action_due });
      addDealEvent(db, dealId, "ai", "経緯と状況を更新");
      return getDeal(db, dealId)!;
    } catch (e) {
      console.error("[deal-refresh] AI summary failed, fallback:", e instanceof Error ? e.message : e);
    }
  }
  updateDeal(db, dealId, fallbackDealSummary(db, dealId));
  return getDeal(db, dealId)!;
}
