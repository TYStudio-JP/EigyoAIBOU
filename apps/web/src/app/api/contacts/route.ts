import { createContact, listContacts } from "@eigyo/core";
import { db } from "@/lib/db";
import { fail, ok } from "../_util";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const c = new URL(req.url).searchParams.get("customer_id");
  return ok(listContacts(db(), c ? Number(c) : undefined, { includeInactive: true }));
}
export async function POST(req: Request) {
  try {
    const b = (await req.json()) as Parameters<typeof createContact>[1];
    if (!b.customer_id || !b.name?.trim()) return fail(new Error("得意先と氏名は必須です"), 400);
    return ok(createContact(db(), b), { status: 201 });
  } catch (e) { return fail(e); }
}
