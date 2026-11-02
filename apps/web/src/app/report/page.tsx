import { hasApiKey } from "@eigyo/core";
import { PageTitle } from "@/components/ui";
import { ReportEditor } from "@/components/report-editor";
import { todayIso } from "@/lib/format";
export const dynamic = "force-dynamic";
export default function ReportPage() {
  return (<><PageTitle title="営業日報" sub="今日の電話・見積り・フォロー・案件の動きから下書きを作ります。一言足して提出するだけ。" /><ReportEditor initialDate={todayIso()} aiEnabled={hasApiKey()} /></>);
}
