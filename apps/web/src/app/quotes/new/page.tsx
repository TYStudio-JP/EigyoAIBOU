import { hasApiKey, listContacts, listCustomers, SAMPLE_REQUESTS } from "@eigyo/core";
import { db } from "@/lib/db";
import { PageTitle } from "@/components/ui";
import { QuoteComposer } from "@/components/quote-composer";

export const dynamic = "force-dynamic";

export default async function NewQuotePage({ searchParams }: { searchParams: Promise<{ text?: string; customer?: string; product?: string }> }) {
  const sp = await searchParams;
  const customers = listCustomers(db());
  return (
    <>
      <PageTitle title="見積りを作る" />
      <QuoteComposer customers={customers} contacts={listContacts(db(), undefined, { includeInactive: false })} samples={SAMPLE_REQUESTS} aiEnabled={hasApiKey()} initialText={sp.text ?? (sp.product ? `商品ID ${sp.product} の見積り依頼（写真で特定した商品）` : "")} initialCustomerId={sp.customer ? Number(sp.customer) : null} />
    </>
  );
}
