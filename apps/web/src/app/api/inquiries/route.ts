import { listInquiries, logInquiryFromText, INQUIRY_CHANNEL_LABEL, type InquiryChannel, type InquiryStatus } from "@eigyo/core";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/user";
import { fail, ok } from "../_util";

export const dynamic = "force-dynamic";

/** 問い合わせ一覧。?status=open,answered  ?customer_id=  ?all=1（担当以外も） */
export async function GET(req: Request) {
  try {
    const d = db();
    const me = await currentUser(d);
    const u = new URL(req.url);
    const status = u.searchParams.get("status")?.split(",").filter(Boolean) as InquiryStatus[] | undefined;
    const customerId = u.searchParams.get("customer_id") ? Number(u.searchParams.get("customer_id")) : undefined;
    return ok(listInquiries(d, { status, customerId, userId: u.searchParams.get("all") === "1" ? null : me?.id ?? null, limit: 200 }));
  } catch (e) { return fail(e); }
}

/** 問い合わせを登録する（文面から得意先と種類を推定）。 */
export async function POST(req: Request) {
  try {
    const d = db();
    const me = await currentUser(d);
    const b = (await req.json()) as { question?: string; customer_id?: number | null; channel?: InquiryChannel; due?: string | null; source?: string };
    if (!b.question?.trim()) return fail(new Error("問い合わせの内容を入力してください"), 400);
    if (b.channel && !(b.channel in INQUIRY_CHANNEL_LABEL)) return fail(new Error("channel が不正です"), 400);
    if (b.due && !/^\d{4}-\d{2}-\d{2}$/.test(b.due)) return fail(new Error("期限は YYYY-MM-DD で指定してください"), 400);
    return ok(logInquiryFromText(d, b.question, { user_id: me?.id ?? null, customer_id: b.customer_id ?? null, channel: b.channel, due: b.due ?? null, source: b.source ?? "manual" }), { status: 201 });
  } catch (e) { return fail(e); }
}
