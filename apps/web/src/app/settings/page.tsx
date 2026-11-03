import { getSettings, hasApiKey, listUsers, MODEL } from "@eigyo/core";
import { currentUser } from "@/lib/user";
import { db } from "@/lib/db";
import { PageTitle } from "@/components/ui";
import { SettingsForm } from "@/components/settings-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const d = db();
  const me = await currentUser(d);
  return (
    <>
      <div className="lg:hidden mb-3 rounded-md border border-line bg-surface px-3 py-2 text-xs text-muted">登録・変更はパソコンから行えます。</div>
      <PageTitle title="設定" />
      <SettingsForm initial={getSettings(d)} ai={{ enabled: hasApiKey(), model: MODEL }} users={listUsers(d, { includeInactive: true })} meId={me?.id ?? null} />
    </>
  );
}
