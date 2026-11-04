import { createVisit, homeMode, listVisits, matchCustomerByText, stampOf } from "@eigyo/core";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/user";
import { fail, ok } from "../_util";

export const dynamic = "force-dynamic";

/** 訪問予定。?from=YYYY-MM-DD&to=YYYY-MM-DD（省略時は今日〜14 日）。?all=1 で全員分。mode に今のホーム切替を含む。 */
export async function GET(req: Request) {
  try {
    const d = db();
    const me = await currentUser(d);
    const u = new URL(req.url);
    const now = new Date();
    const today = stampOf(now).slice(0, 10);
    const from = u.searchParams.get("from") ?? today;
    const toD = new Date(now); toD.setDate(toD.getDate() + 14);
    const to = (u.searchParams.get("to") ?? stampOf(toD).slice(0, 10)) + " 23:59";
    const userId = u.searchParams.get("all") === "1" ? null : me?.id ?? null;
    return ok({ visits: listVisits(d, { userId, from: from + " 00:00", to }), home: homeMode(d, me?.id ?? null, now), ics_url: me?.calendar_ics_url ?? null });
  } catch (e) { return fail(e); }
}

/** 手入力で訪問を追加。customer_id が無ければタイトル・場所から推定。 */
export async function POST(req: Request) {
  try {
    const d = db();
    const me = await currentUser(d);
    const b = (await req.json()) as { title?: string; customer_id?: number | null; starts_at: string; ends_at?: string | null; place?: string; notes?: string };
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(b.starts_at ?? "")) return fail(new Error("開始日時は YYYY-MM-DD HH:MM で指定してください"), 400);
    if (b.ends_at && !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(b.ends_at)) return fail(new Error("終了日時の形式が不正です"), 400);
    const customer = b.customer_id ? null : matchCustomerByText(d, `${b.title ?? ""} ${b.place ?? ""}`);
    const title = (b.title ?? "").trim() || (customer ? `${customer.short_name} 訪問` : "訪問");
    return ok(createVisit(d, { user_id: me?.id ?? null, customer_id: b.customer_id ?? customer?.id ?? null, title, starts_at: b.starts_at, ends_at: b.ends_at ?? null, place: b.place ?? "", notes: b.notes ?? "" }), { status: 201 });
  } catch (e) { return fail(e); }
}
