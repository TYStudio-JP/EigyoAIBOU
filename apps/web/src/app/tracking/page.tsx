import { followupQueue, getSettings, hasApiKey } from "@eigyo/core";
import { db } from "@/lib/db";
import { PageTitle } from "@/components/ui";
import { TrackingBoard } from "@/components/tracking-board";

export const dynamic = "force-dynamic";

export default function TrackingPage() {
  const d = db();
  const s = getSettings(d);
  return (
    <>
      <PageTitle title="追跡ボード — あの見積り、どうなった？" sub={`提出から ${s.followup_days_first} 日、以降 ${s.followup_days_repeat} 日ごとにフォローを促します（設定で変更可）。受注・失注の確定は見積り詳細から。`} />
      <TrackingBoard items={followupQueue(d)} aiEnabled={hasApiKey()} />
    </>
  );
}
