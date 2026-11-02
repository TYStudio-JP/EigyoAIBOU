import { createCall, findCustomerByTel, listCalls, type CallStatus } from "@eigyo/core";
import { db } from "@/lib/db";
import { fail, ok } from "../_util";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const status = u.searchParams.get("status")?.split(",").filter(Boolean) as CallStatus[] | undefined;
  return ok(listCalls(db(), { status, limit: 100 }));
}

/** 手動・MCP からの通話作成。 */
export async function POST(req: Request) {
  try {
    const b = (await req.json()) as { customer_id?: number | null; tel?: string | null; direction?: "in" | "out" | "unknown"; started_at?: string; duration_sec?: number | null; memo?: string; source?: string };
    const d = db();
    const customer_id = b.customer_id ?? (b.tel ? findCustomerByTel(d, b.tel)?.id ?? null : null);
    return ok(createCall(d, { ...b, customer_id }), { status: 201 });
  } catch (e) { return fail(e); }
}
