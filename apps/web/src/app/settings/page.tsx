import { getSettings, hasApiKey, MODEL } from "@eigyo/core";
import { db } from "@/lib/db";
import { PageTitle } from "@/components/ui";
import { SettingsForm } from "@/components/settings-form";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <>
      <PageTitle title="設定" sub="会社ごとのルール（粗利の下限・フォロー間隔）をここで決めます。" />
      <SettingsForm initial={getSettings(db())} ai={{ enabled: hasApiKey(), model: MODEL }} />
    </>
  );
}
