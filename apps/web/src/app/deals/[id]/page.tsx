import { notFound } from "next/navigation";
import { dealTimeline, getDeal, hasApiKey, listContacts, listDeals, listEndCustomers, listQuotes } from "@eigyo/core";
import { db } from "@/lib/db";
import { DealDetail } from "@/components/deal-detail";

export const dynamic = "force-dynamic";

export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = db();
  const deal = getDeal(d, Number(id));
  if (!deal) notFound();
  return (
    <DealDetail
      deal={deal}
      timeline={dealTimeline(d, deal.id)}
      contacts={listContacts(d, deal.customer_id, { includeInactive: true })}
      endCustomers={listEndCustomers(d, deal.customer_id)}
      siblings={listDeals(d, { customerId: deal.customer_id, openOnly: true, limit: 50 }).map((x) => ({ id: x.id, title: x.title }))}
      aiEnabled={hasApiKey()}
      quoteIds={Object.fromEntries(listQuotes(d, { customerId: deal.customer_id, limit: 300 }).map((q) => [q.quote_no, q.id]))}
    />
  );
}
