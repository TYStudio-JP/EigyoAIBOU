import { listCustomers } from "@eigyo/core";
import { db } from "@/lib/db";
import { PageTitle } from "@/components/ui";
import { InquiryForm } from "@/components/inquiry-form";

export const dynamic = "force-dynamic";

export default async function NewInquiryPage({ searchParams }: { searchParams: Promise<{ text?: string; customer?: string }> }) {
  const sp = await searchParams;
  const customers = listCustomers(db()).map((c) => ({ id: c.id, short_name: c.short_name, name: c.name }));
  return (<><PageTitle title="問い合わせを記録" sub="メール・LINE の文面を貼るか、電話で聞いた内容を話してください。得意先と種類は文面から推定します。" /><InquiryForm customers={customers} initialText={sp.text ?? ""} initialCustomerId={sp.customer ? Number(sp.customer) : null} /></>);
}
