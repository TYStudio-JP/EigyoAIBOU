"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui";

/** 裏で動いている議事録作成。2 秒ごとに様子を見て、終わったら画面を更新する。キャンセルはここから。 */
export function CallProcessing({ callId, state }: { callId: number; state: "running" | "cancel" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const r = await fetch(`/api/calls/${callId}`, { cache: "no-store" });
        const j = (await r.json()) as { process_state?: string | null };
        if (!j.process_state) router.refresh();
      } catch { /* 次の周回で再確認 */ }
    }, 2000);
    return () => clearInterval(t);
  }, [callId, router]);
  const cancel = async () => {
    setBusy(true);
    try { await fetch(`/api/calls/${callId}/process`, { method: "DELETE" }); } finally { router.refresh(); }
  };
  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-3 flex items-center gap-3">
      <span className="inline-block w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin shrink-0" />
      <div className="flex-1 text-sm font-medium">{state === "cancel" ? "止めています" : "議事録・回答・確認メールを作成中"}</div>
      <Button size="sm" onClick={cancel} busy={busy} disabled={state === "cancel"}>キャンセル</Button>
    </div>
  );
}
