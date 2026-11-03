import { deliveryWaitingList } from "@eigyo/core";
import { db } from "@/lib/db";
import { PageTitle } from "@/components/ui";
import { DeliveryBoard } from "@/components/delivery-board";
export const dynamic = "force-dynamic";
export default function DeliveryPage() {
  return (<><PageTitle title="納期回答待ち" /><DeliveryBoard items={deliveryWaitingList(db())} /></>);
}
