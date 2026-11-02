import { hasApiKey, listCustomers } from "@eigyo/core";
import { db } from "@/lib/db";
import { Card, PageTitle } from "@/components/ui";
import { CallMemo } from "@/components/call-memo";

export const dynamic = "force-dynamic";

export default function NewCallPage() {
  return (
    <>
      <PageTitle title="電話メモ" sub="切った直後に話してください。数量・価格・納期・約束は営業AI棒が拾います。" />
      <Card><CallMemo call={null} customers={listCustomers(db())} aiEnabled={hasApiKey()} /></Card>
    </>
  );
}
