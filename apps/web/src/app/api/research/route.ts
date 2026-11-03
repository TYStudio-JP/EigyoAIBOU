import { researchWeb } from "@eigyo/core";
import { todayIso } from "@/lib/format";
import { fail, ok } from "../_util";
export const dynamic = "force-dynamic";
/** ウェブで調べる（商品・メーカー・規格・相場など）。 */
export async function POST(req: Request) {
  try { const b = (await req.json()) as { query: string; context?: string; kind?: "general" | "equivalent" | "spec" | "size" | "price" | "successor" }; if (!b.query?.trim()) return fail(new Error("調べたいことを入力してください"), 400); return ok(await researchWeb(b.query, b.context ?? "", todayIso(), b.kind ?? "general")); } catch (e) { return fail(e); }
}
