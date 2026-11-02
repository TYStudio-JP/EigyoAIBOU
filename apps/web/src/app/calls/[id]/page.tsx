import { notFound } from "next/navigation";
import { getCall, getDeal, hasApiKey, listContacts, listCustomers, listDeals } from "@eigyo/core";
import { db } from "@/lib/db";
import { CallDetail } from "@/components/call-detail";

export const dynamic = "force-dynamic";

export default async function CallPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ fresh?: string }> }) {
  const { id } = await params;
  const { fresh } = await searchParams;
  const d = db();
  const call = getCall(d, Number(id));
  if (!call) notFound();
  const deal = call.deal_id ? getDeal(d, call.deal_id) : null;
  return <CallDetail call={call} customers={listCustomers(d)} contacts={listContacts(d, undefined, { includeInactive: false })} aiEnabled={hasApiKey()} fresh={fresh === "1"} deal={deal ? { id: deal.id, title: deal.title } : null} dealOptions={call.customer_id ? listDeals(d, { customerId: call.customer_id, openOnly: true, limit: 30 }).map((x) => ({ id: x.id, title: x.title })) : []} />;
}
