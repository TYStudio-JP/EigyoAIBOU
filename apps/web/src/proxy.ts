import { NextResponse, type NextRequest } from "next/server";

/**
 * 外出先（HTTPS トンネル）から使うための簡易アクセスキー。
 * .env の EIGYO_ACCESS_KEY が設定されているときだけ有効。
 * - ?key=xxx 付きで開くと Cookie を発行してキーを URL から外す（スマホのホーム画面追加用）
 * - 未認証の API は 401、画面は /unlock へ
 */
export function proxy(req: NextRequest) {
  const key = process.env.EIGYO_ACCESS_KEY;
  if (!key) return NextResponse.next();
  const url = req.nextUrl;
  const given = url.searchParams.get("key");
  if (given === key) {
    url.searchParams.delete("key");
    const res = NextResponse.redirect(url);
    res.cookies.set("eigyo_key", key, { httpOnly: true, sameSite: "lax", secure: url.protocol === "https:", maxAge: 60 * 60 * 24 * 90, path: "/" });
    return res;
  }
  if (req.cookies.get("eigyo_key")?.value === key) return NextResponse.next();
  if (url.pathname === "/unlock") return NextResponse.next();
  if (url.pathname.startsWith("/api/")) return NextResponse.json({ error: "アクセスキーが必要です" }, { status: 401 });
  const to = url.clone();
  to.pathname = "/unlock";
  to.search = `?next=${encodeURIComponent(url.pathname + url.search)}`;
  return NextResponse.redirect(to);
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico|manifest.webmanifest|icons/|apple-icon).*)"],
};
