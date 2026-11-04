import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { googleAuthUrl, googleConfigured } from "@eigyo/core";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/user";
import { fail } from "../../_util";

export const dynamic = "force-dynamic";

/** Google の同意画面へ。state に CSRF 用の乱数を入れ Cookie と突き合わせる。 */
export async function GET(req: Request) {
  if (!googleConfigured()) return fail(new Error("Google 連携は未設定です（.env の GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET）"), 424);
  const me = await currentUser(db());
  if (!me) return fail(new Error("ユーザーがありません"), 400);
  const nonce = randomBytes(16).toString("hex");
  const state = `${me.id}.${nonce}`;
  const origin = new URL(req.url).origin;
  const res = NextResponse.redirect(googleAuthUrl(origin, state));
  res.cookies.set("eigyo_gstate", state, { httpOnly: true, sameSite: "lax", secure: origin.startsWith("https"), maxAge: 600, path: "/" });
  return res;
}
