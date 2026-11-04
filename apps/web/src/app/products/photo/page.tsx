import { hasApiKey } from "@eigyo/core";
import { PageTitle } from "@/components/ui";
import { ProductPhoto } from "@/components/product-photo";

export const dynamic = "force-dynamic";

/** 写真で調べる：工場で見た現行品・ラベル・刻印を撮って、品番の読み取り→自社マスタ照合→同等品のウェブ検索。 */
export default async function ProductPhotoPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  return (<><PageTitle title="写真で調べる" sub="現行品のラベルや刻印を撮ると、品番を読み取って自社の取扱品と照合し、同等品・後継品をウェブで調べます。" /><ProductPhoto aiEnabled={hasApiKey()} shareToken={t ?? null} /></>);
}
