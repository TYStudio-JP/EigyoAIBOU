import Link from "next/link";
import { notFound } from "next/navigation";
import { getCustomer, hasApiKey, visitBrief } from "@eigyo/core";
import { db } from "@/lib/db";
import { PageTitle } from "@/components/ui";
import { BriefView } from "@/components/brief-view";
export const dynamic = "force-dynamic";
export default async function BriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = db();
  const c = getCustomer(d, Number(id));
  if (!c) notFound();
  return (<><PageTitle title={`訪問前ブリーフ — ${c.short_name}`} sub={<>{c.industry}・{c.prefecture}・{c.notes}　<Link href={`/customers/${c.id}`} className="text-brand hover:underline">得意先ページ</Link></>} /><BriefView brief={visitBrief(d, c.id)} aiEnabled={hasApiKey()} /></>);
}
