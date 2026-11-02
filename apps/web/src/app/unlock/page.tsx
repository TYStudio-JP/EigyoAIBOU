import { PageTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

/** アクセスキー入力（EIGYO_ACCESS_KEY 設定時のみ到達）。送信先は同じ URL の ?key= で proxy が Cookie を発行する。 */
export default async function UnlockPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="max-w-sm mx-auto mt-16">
      <PageTitle title="営業AI棒" sub="アクセスキーを入力してください" />
      <form method="GET" action={next && next.startsWith("/") ? next.split("?")[0] : "/"} className="space-y-3">
        <input name="key" type="password" autoFocus className="w-full rounded-md border border-line px-3 py-3 text-base" placeholder="アクセスキー" />
        <button className="w-full rounded-md bg-brand text-brand-ink py-3 font-semibold">開く</button>
      </form>
    </div>
  );
}
