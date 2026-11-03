import { hasApiKey } from "@eigyo/core";
import { PageTitle } from "@/components/ui";
import { ReportEditor } from "@/components/report-editor";
import { todayIso } from "@/lib/format";
export const dynamic = "force-dynamic";
export default function ReportPage() {
  return (<><PageTitle title="営業日報" /><ReportEditor initialDate={todayIso()} aiEnabled={hasApiKey()} /></>);
}
