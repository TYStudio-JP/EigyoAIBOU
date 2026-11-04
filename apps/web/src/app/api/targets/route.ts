import { targetProgress, updateUser } from "@eigyo/core";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/user";
import { fail, ok } from "../_util";

export const dynamic = "force-dynamic";

/** 今月の目標と実績。?month=YYYY-MM、?all=1 で全員分。 */
export async function GET(req: Request) {
  try {
    const d = db();
    const me = await currentUser(d);
    const u = new URL(req.url);
    return ok(targetProgress(d, { userId: u.searchParams.get("all") === "1" ? null : me?.id ?? null, month: u.searchParams.get("month") ?? undefined }));
  } catch (e) { return fail(e); }
}

/** 目標（売上・粗利）を設定する。user_id 省略時は操作中ユーザー。 */
export async function POST(req: Request) {
  try {
    const d = db();
    const me = await currentUser(d);
    const b = (await req.json()) as { user_id?: number; target_sales?: number | null; target_margin?: number | null };
    const id = b.user_id ?? me?.id;
    if (!id) return fail(new Error("ユーザーがありません"), 400);
    const patch: { target_sales?: number | null; target_margin?: number | null } = {};
    for (const k of ["target_sales", "target_margin"] as const) if (b[k] !== undefined) { const v = b[k]; if (v !== null && !(Number(v) >= 0)) return fail(new Error("目標は 0 以上の数値で指定してください"), 400); patch[k] = v === null ? null : Number(v); }
    updateUser(d, id, patch);
    return ok(targetProgress(d, { userId: id }));
  } catch (e) { return fail(e); }
}
