import { hasApiKey, listContacts, listCustomers } from "@eigyo/core";
import { db } from "@/lib/db";
import { Card, PageTitle } from "@/components/ui";
import { CallMemo } from "@/components/call-memo";

export const dynamic = "force-dynamic";

export default function NewCallPage() {
  return (
    <>
      <PageTitle title="電話メモ" />
      <Card><CallMemo call={null} customers={listCustomers(db())} contacts={listContacts(db(), undefined, { includeInactive: false })} aiEnabled={hasApiKey()} /></Card>
    </>
  );
}
