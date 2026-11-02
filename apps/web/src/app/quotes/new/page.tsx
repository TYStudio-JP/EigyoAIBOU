import { hasApiKey, listCustomers, SAMPLE_REQUESTS } from "@eigyo/core";
import { db } from "@/lib/db";
import { PageTitle } from "@/components/ui";
import { QuoteComposer } from "@/components/quote-composer";

export const dynamic = "force-dynamic";

export default function NewQuotePage() {
  const customers = listCustomers(db());
  return (
    <>
      <PageTitle title="見積りを作る" sub="メール・電話メモ・添付をそのまま渡すだけ。品目の特定、過去価格・原価・仕入れルートの照合、赤字や値下げの警告まで営業AI棒が済ませます。" />
      <QuoteComposer customers={customers} samples={SAMPLE_REQUESTS} aiEnabled={hasApiKey()} />
    </>
  );
}
