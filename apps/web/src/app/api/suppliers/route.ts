import { listSuppliers } from "@eigyo/core";
import { db } from "@/lib/db";
import { ok } from "../_util";

export const dynamic = "force-dynamic";
export async function GET() { return ok(listSuppliers(db())); }
