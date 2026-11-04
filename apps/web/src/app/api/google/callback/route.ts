import { NextResponse } from "next/server";
import { googleConnect, syncGoogleCalendar } from "@eigyo/core";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Google からの戻り。state を検証し、トークンを保存して初回同期、訪問予定へ戻る。 */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const back = (msg: string, ok = false) => NextResponse.redirect(new URL(`/visits?google=${ok ? "ok" : "error"}&msg=${encodeURIComponent(msg)}`, req.url), 303);
  const err = u.searchParams.get("error");
  if (err) return back(`Google で拒否されました（${err}）`);
  const code = u.searchParams.get("code"); const state = u.searchParams.get("state") ?? "";
  const cookie = req.headers.get("cookie") ?? "";
  const saved = /(?:^|;\s*)eigyo_gstate=([^;]+)/.exec(cookie)?.[1];
  if (!code || !state || !saved || saved !== state) return back("認証の状態が一致しません。もう一度やり直してください");
  const userId = Number(state.split(".")[0]);
  try {
    const d = db();
    const { email } = await googleConnect(d, userId, code, u.origin);
    const r = await syncGoogleCalendar(d, userId);
    const res = back(`${email ?? "Google"} と連携しました。${r.fetched} 件を取り込み（得意先を推定 ${r.matched} 件）`, true);
    res.cookies.set("eigyo_gstate", "", { maxAge: 0, path: "/" });
    return res;
  } catch (e) { return back(e instanceof Error ? e.message : String(e)); }
}
