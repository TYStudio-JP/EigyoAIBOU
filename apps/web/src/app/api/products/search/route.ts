import { findProducts, listProducts } from "@eigyo/core";
import { db } from "@/lib/db";
import { ok } from "../../_util";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const d = db();
  return ok(q.trim() ? findProducts(d, q, 15) : listProducts(d).slice(0, 15));
}
