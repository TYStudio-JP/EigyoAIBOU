import { createUser, listUsers, updateUser } from "@eigyo/core";
import { db } from "@/lib/db";
import { fail, ok } from "../_util";
export const dynamic = "force-dynamic";
export async function GET() { return ok(listUsers(db(), { includeInactive: true })); }
export async function POST(req: Request) {
  try {
    const b = (await req.json()) as { id?: number; name?: string; department?: string; email?: string | null; status?: "active" | "inactive"; target_sales?: number | null; target_margin?: number | null; proxy_send_allowed?: boolean | number; calendar_ics_url?: string | null };
    const d = db();
    const patch: Record<string, unknown> = {};
    for (const k of ["name", "department", "email", "status", "calendar_ics_url"] as const) if (b[k] !== undefined) patch[k] = b[k];
    for (const k of ["target_sales", "target_margin"] as const) if (b[k] !== undefined) { const v = b[k]; if (v !== null && !(Number(v) >= 0)) return fail(new Error("目標は 0 以上の数値で指定してください"), 400); patch[k] = v === null ? null : Number(v); }
    if (b.proxy_send_allowed !== undefined) patch.proxy_send_allowed = b.proxy_send_allowed ? 1 : 0;
    if (b.id) return ok(updateUser(d, b.id, patch));
    if (!b.name?.trim()) return fail(new Error("氏名を入力してください"), 400);
    return ok(createUser(d, { name: b.name, department: b.department, email: b.email, status: b.status, target_sales: b.target_sales ?? null, target_margin: b.target_margin ?? null }));
  } catch (e) { return fail(e); }
}
