import { createEndCustomer } from "@eigyo/core";
import { db } from "@/lib/db";
import { fail, ok } from "../_util";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try { const b = (await req.json()) as { customer_id: number; name: string; industry?: string; notes?: string }; if (!b.name?.trim()) return fail(new Error("名称は必須です"), 400); return ok(createEndCustomer(db(), b), { status: 201 }); } catch (e) { return fail(e); }
}
