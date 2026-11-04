import { syncIcsFromUrl, syncIcsText, updateUser } from "@eigyo/core";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/user";
import { fail, ok } from "../../_util";

export const dynamic = "force-dynamic";

/**
 * カレンダー取り込み。
 * - { ics_url } を渡すと操作中ユーザーに保存してから取り込む（空文字で解除）。
 * - { ics_text } を渡すと、その iCal テキストを直接取り込む（エクスポートした .ics を貼る場合）。
 * - どちらも無ければ保存済み URL で取り込む。
 */
export async function POST(req: Request) {
  try {
    const d = db();
    const me = await currentUser(d);
    if (!me) return fail(new Error("ユーザーがありません"), 400);
    const b = (await req.json().catch(() => ({}))) as { ics_url?: string | null; ics_text?: string };
    if (b.ics_url !== undefined) {
      const url = (b.ics_url ?? "").trim();
      updateUser(d, me.id, { calendar_ics_url: url || null });
      if (!url) return ok({ cleared: true });
    }
    if (b.ics_text) return ok(syncIcsText(d, me.id, b.ics_text));
    return ok(await syncIcsFromUrl(d, me.id));
  } catch (e) { return fail(e); }
}
