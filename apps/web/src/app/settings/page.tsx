import { getSettings, hasApiKey, MODEL } from "@eigyo/core";
import { db } from "@/lib/db";
import { PageTitle } from "@/components/ui";
import { SettingsForm } from "@/components/settings-form";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <>
      <div className="lg:hidden mb-3 rounded-md border border-line bg-surface px-3 py-2 text-xs text-muted">マスタの登録・変更はデスクトップから行ってください。スマホでは閲覧のみです。</div>
      <PageTitle title="設定" sub="会社ごとのルール（粗利の下限・フォロー間隔）をここで決めます。" />
      <SettingsForm initial={getSettings(db())} ai={{ enabled: hasApiKey(), model: MODEL }} />
    </>
  );
}
