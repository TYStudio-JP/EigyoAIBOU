import Link from "next/link";
import { notFound } from "next/navigation";
import { getCustomer, handoverFacts, hasApiKey, ownerHistory } from "@eigyo/core";
import { db } from "@/lib/db";
import { PageTitle } from "@/components/ui";
import { HandoverDoc } from "@/components/handover-doc";
export const dynamic = "force-dynamic";

export default async function HandoverPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ record?: string }> }) {
  const { id } = await params;
  const { record } = await searchParams;
  const d = db();
  const c = getCustomer(d, Number(id));
  if (!c) notFound();
  const rec = record ? ownerHistory(d, c.id).find((h) => h.id === Number(record)) : undefined;
  const initial = rec?.handover_doc || handoverFacts(d, c.id);
  return (
    <>
      <PageTitle title={`引継ぎ書 — ${c.short_name}`} sub={<>{rec ? `${rec.handed_at.slice(0, 10)} 引継ぎ時に保存された内容` : "現在の状態から自動生成（担当者・納入先・進行中の案件・直近の受注失注）"}　<Link href={`/customers/${c.id}`} className="text-brand hover:underline">得意先へ戻る</Link></>} />
      <HandoverDoc customerId={c.id} initial={initial} aiEnabled={hasApiKey() && !rec} />
    </>
  );
}
