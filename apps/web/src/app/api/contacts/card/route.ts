import { extractBusinessCard, findCustomer, listCustomers } from "@eigyo/core";
import { db } from "@/lib/db";
import { fail, ok } from "../../_util";
export const dynamic = "force-dynamic";
/** 名刺画像 → 担当者情報（＋得意先の候補）。 */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const f = form.get("image");
    if (!(f instanceof File) || f.size === 0) return fail(new Error("画像がありません"), 400);
    const type = (f.type || "image/jpeg") as "image/jpeg" | "image/png" | "image/webp" | "image/gif";
    const d = db();
    const base64 = Buffer.from(await f.arrayBuffer()).toString("base64");
    const card = await extractBusinessCard({ media_type: type, base64 }, listCustomers(d).map((c) => c.name));
    const tokens = (card.company ?? "").replace(/株式会社|有限会社|合同会社/g, " ").split(/[\s　]+/).filter((t) => t.length >= 2);
    const seen = new Map<number, ReturnType<typeof findCustomer>[number]>();
    for (const t of [card.company ?? "", ...tokens]) if (t) for (const c of findCustomer(d, t)) seen.set(c.id, c);
    return ok({ card, customer_candidates: [...seen.values()] });
  } catch (e) { return fail(e); }
}
