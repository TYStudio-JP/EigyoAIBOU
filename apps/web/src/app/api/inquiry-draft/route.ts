import { draftSupplierInquiry, getSettings } from "@eigyo/core";
import { db } from "@/lib/db";
import { todayIso } from "@/lib/format";
import { fail, ok } from "../_util";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try {
    const b = (await req.json()) as { supplier_name: string; product_desc: string; qty: number; unit: string; question: string; requested_delivery: string | null };
    return ok(await draftSupplierInquiry({ ...b, settings: getSettings(db()), today: todayIso() }));
  } catch (e) { return fail(e); }
}
