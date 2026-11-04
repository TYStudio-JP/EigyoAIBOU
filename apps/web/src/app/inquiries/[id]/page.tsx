import { notFound } from "next/navigation";
import { getInquiry, hasApiKey, inquiryFacts, listCustomers } from "@eigyo/core";
import { db } from "@/lib/db";
import { PageTitle } from "@/components/ui";
import { InquiryAnswer } from "@/components/inquiry-answer";

export const dynamic = "force-dynamic";

export default async function InquiryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = db();
  const i = getInquiry(d, Number(id));
  if (!i) notFound();
  const facts = inquiryFacts(d, i.id);
  return (
    <>
      <PageTitle title={`問い合わせ — ${i.customer?.short_name ?? "得意先未設定"}`} sub={`${i.created_at.slice(0, 16)} 受付${i.due ? `・期限 ${i.due}` : ""}`} />
      <InquiryAnswer facts={facts} aiEnabled={hasApiKey()} customers={listCustomers(d).map((c) => ({ id: c.id, short_name: c.short_name }))} />
    </>
  );
}
