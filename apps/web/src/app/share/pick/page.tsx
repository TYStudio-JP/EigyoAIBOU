import { getShareItem } from "@eigyo/core";
import { db } from "@/lib/db";
import { PageTitle } from "@/components/ui";
import { SharePick } from "@/components/share-pick";

export const dynamic = "force-dynamic";

/** 共有メニューから受け取った内容をどう使うか選ぶ。 */
export default async function SharePickPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  const item = t ? getShareItem(db(), t) : null;
  return (
    <>
      <PageTitle title="受け取った内容をどうしますか？" sub={item ? `共有メニューから ${item.created_at.slice(11, 16)} に受け取りました（1 時間で消えます）` : "共有メニューから開くと、ここにメールや写真が入ります。iPhone は本文をコピーして貼り付けてください。"} />
      <SharePick item={item} />
    </>
  );
}
