import { openDb, seedDatabase } from "@eigyo/core";
import { fail, ok } from "../_util";
export const dynamic = "force-dynamic";
export async function POST() {
  try { return ok(seedDatabase(openDb())); } catch (e) { return fail(e); }
}
