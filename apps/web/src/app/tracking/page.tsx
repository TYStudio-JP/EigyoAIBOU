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
      <PageTitle title="追跡ボード" sub={`提出から ${s.followup_days_first} 日、以降 ${s.followup_days_repeat} 日ごと`} />
      <TrackingBoard items={followupQueue(d)} aiEnabled={hasApiKey()} />
    </>
  );
}
