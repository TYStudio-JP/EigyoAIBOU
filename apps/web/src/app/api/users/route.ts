import { createUser, listUsers, updateUser } from "@eigyo/core";
import { db } from "@/lib/db";
import { fail, ok } from "../_util";
export const dynamic = "force-dynamic";
export async function GET() { return ok(listUsers(db(), { includeInactive: true })); }
export async function POST(req: Request) {
  try { const b = (await req.json()) as { id?: number; name: string; department?: string; email?: string | null; status?: "active" | "inactive" }; const d = db(); return ok(b.id ? updateUser(d, b.id, b) : createUser(d, b)); } catch (e) { return fail(e); }
}
