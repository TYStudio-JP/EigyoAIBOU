import { notFound } from "next/navigation";
import { getCall, hasApiKey, listCustomers } from "@eigyo/core";
import { db } from "@/lib/db";
import { CallDetail } from "@/components/call-detail";

export const dynamic = "force-dynamic";

export default async function CallPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ fresh?: string }> }) {
  const { id } = await params;
  const { fresh } = await searchParams;
  const d = db();
  const call = getCall(d, Number(id));
  if (!call) notFound();
  return <CallDetail call={call} customers={listCustomers(d)} aiEnabled={hasApiKey()} fresh={fresh === "1"} />;
}
