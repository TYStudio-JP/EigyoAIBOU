import { deliveryWaitingList } from "@eigyo/core";
import { db } from "@/lib/db";
import { PageTitle } from "@/components/ui";
import { DeliveryBoard } from "@/components/delivery-board";
export const dynamic = "force-dynamic";
export default function DeliveryPage() {
  return (<><PageTitle title="納期回答待ち" sub="仕入れ先から返ってきた納期を入れると、回答納期が見積りに反映され、得意先向けの連絡文が出ます。" /><DeliveryBoard items={deliveryWaitingList(db())} /></>);
}
