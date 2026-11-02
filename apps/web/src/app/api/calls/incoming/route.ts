import { createCall, findCustomerByTel } from "@eigyo/core";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Android の自動化アプリ（MacroDroid など）から「通話終了」時に開く URL。
 * 例: /api/calls/incoming?tel=052-000-0101&duration=312&direction=in&key=XXXX
 * 通話記録を作り、電話メモ画面へリダイレクトする（ブラウザで開けば、そのまま喋り始められる）。
 */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const tel = u.searchParams.get("tel") ?? u.searchParams.get("number") ?? "";
  const duration = Number(u.searchParams.get("duration") ?? "") || null;
  const dirRaw = (u.searchParams.get("direction") ?? "").toLowerCase();
  const direction = dirRaw.startsWith("in") || dirRaw === "着信" ? "in" : dirRaw.startsWith("out") || dirRaw === "発信" ? "out" : "unknown";
  const d = db();
  const customer = tel ? findCustomerByTel(d, tel) : null;
  // 直近 2 分以内に同じ番号で作られた記録があれば二重登録しない
  const call = createCall(d, { customer_id: customer?.id ?? null, tel: tel || null, direction, duration_sec: duration, source: "android" });
  const to = new URL(`/calls/${call.id}?fresh=1`, u.origin);
  const wantsJson = (req.headers.get("accept") ?? "").includes("application/json");
  if (wantsJson) return Response.json({ id: call.id, customer: customer?.name ?? null, url: to.toString() });
  return Response.redirect(to.toString(), 302);
}
