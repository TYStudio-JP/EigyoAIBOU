import { listDeals, type DealStatus } from "@eigyo/core";
import { db } from "@/lib/db";
import { ok } from "../_util";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const u = new URL(req.url);
  const customerId = u.searchParams.get("customer_id");
  const status = u.searchParams.get("status")?.split(",").filter(Boolean) as DealStatus[] | undefined;
  return ok(listDeals(db(), { customerId: customerId ? Number(customerId) : undefined, status, openOnly: u.searchParams.get("open") === "1" }));
}
