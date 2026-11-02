import { hasApiKey, listCustomers } from "@eigyo/core";
import { db } from "@/lib/db";
import { PageTitle } from "@/components/ui";
import { ContactForm } from "@/components/contact-form";
export const dynamic = "force-dynamic";
export default async function NewContactPage({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  const { customer } = await searchParams;
  return (<><PageTitle title="担当者を追加" sub="得意先の担当者を登録します。名刺を撮れば営業AI棒が読み取ります。" /><ContactForm customers={listCustomers(db())} customerId={customer ? Number(customer) : undefined} aiEnabled={hasApiKey()} /></>);
}
