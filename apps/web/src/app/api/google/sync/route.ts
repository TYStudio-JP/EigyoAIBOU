import { googleConfigured, googleDisconnect, syncGoogleCalendar } from "@eigyo/core";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/user";
import { fail, ok } from "../../_util";

export const dynamic = "force-dynamic";

/** 連携状態。 */
export async function GET() {
  const me = await currentUser(db());
  return ok({ configured: googleConfigured(), connected: Boolean(me?.google_refresh_token), email: me?.google_email ?? null });
}
/** 今すぐ同期。 */
export async function POST() {
  try { const d = db(); const me = await currentUser(d); if (!me) return fail(new Error("ユーザーがありません"), 400); return ok(await syncGoogleCalendar(d, me.id)); } catch (e) { return fail(e); }
}
/** 連携を解除（トークンを消す。取り込んだ予定は残る）。 */
export async function DELETE() {
  try { const d = db(); const me = await currentUser(d); if (!me) return fail(new Error("ユーザーがありません"), 400); googleDisconnect(d, me.id); return ok({ connected: false }); } catch (e) { return fail(e); }
}
