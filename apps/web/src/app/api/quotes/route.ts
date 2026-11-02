import { adjudicateDealLink, attachQuoteToDeal, createQuote, hasApiKey, listQuotes, refreshDealSummary, type QuoteStatus } from "@eigyo/core";
import { db } from "@/lib/db";
import { fail, ok } from "../_util";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const status = u.searchParams.get("status")?.split(",").filter(Boolean) as QuoteStatus[] | undefined;
  const q = u.searchParams.get("q") ?? undefined;
  const customerId = u.searchParams.get("customer_id");
  return ok(listQuotes(db(), { status, q, customerId: customerId ? Number(customerId) : undefined }));
}

interface Body {
  customer_id: number; contact_id?: number | null; deal_id?: number | null; subject: string; requested_delivery?: string | null; promised_delivery?: string | null; valid_until?: string | null;
  source_type?: string; source_text?: string; notes?: string;
  items: { product_id: number | null; description: string; qty: number; unit: string; unit_price: number; cost: number; supplier_id: number | null; supplier_delivery?: string | null; remarks?: string }[];
}
export async function POST(req: Request) {
  try {
    const b = (await req.json()) as Body;
    if (!b.customer_id) return fail(new Error("得意先を選択してください"), 400);
    if (!b.items?.length) return fail(new Error("明細がありません"), 400);
    const d = db();
    const q = createQuote(d, { ...b, deal_id: null, status: "draft" });
    const link = await attachQuoteToDeal(d, q.id, { adjudicate: hasApiKey() ? adjudicateDealLink : undefined, force_deal_id: b.deal_id ?? null });
    await refreshDealSummary(d, link.deal.id, { useAi: false });
    return ok({ ...q, deal_id: link.deal.id, link: { deal_id: link.deal.id, title: link.deal.title, created: link.created, confidence: link.confidence, reason: link.reason, alternatives: link.alternatives.map((a) => ({ id: a.id, title: a.title })) } }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}
