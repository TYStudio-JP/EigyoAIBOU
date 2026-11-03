import { hasApiKey, listContacts, listCustomers, SAMPLE_REQUESTS } from "@eigyo/core";
import { db } from "@/lib/db";
import { PageTitle } from "@/components/ui";
import { QuoteComposer } from "@/components/quote-composer";

export const dynamic = "force-dynamic";

export default function NewQuotePage() {
  const customers = listCustomers(db());
  return (
    <>
      <PageTitle title="見積りを作る" />
      <QuoteComposer customers={customers} contacts={listContacts(db(), undefined, { includeInactive: false })} samples={SAMPLE_REQUESTS} aiEnabled={hasApiKey()} />
    </>
  );
}
