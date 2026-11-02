"use client";
import { useEffect, useState } from "react";
import type { FollowupDraft } from "@eigyo/core/shared";
import { Modal, CopyButton } from "./modal";
import { Button } from "./ui";

/** 提出済み見積りのフォロー文面（メール＋電話トーク）を AI に作らせて表示する。 */
export function FollowupModal({ quoteId, quoteNo, onClose, onRecorded }: { quoteId: number; quoteNo: string; onClose: () => void; onRecorded?: () => void }) {
  const [draft, setDraft] = useState<FollowupDraft | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/quotes/${quoteId}/followup-draft`, { method: "POST" });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error);
        setDraft(j);
      } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    })();
  }, [quoteId]);
  const record = async (how: string) => {
    setBusy(true);
    await fetch(`/api/quotes/${quoteId}/activities`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "followup", body: `${how}でフォロー（AI下書きを使用）` }) });
    setBusy(false); onRecorded?.(); onClose();
  };
  return (
    <Modal title={`フォローアップ文面 — ${quoteNo}`} onClose={onClose} wide>
      {err && <p className="text-sm text-danger">{err}</p>}
      {!draft && !err && <p className="text-sm text-muted">営業AI棒が経緯を読んで文面を作っています…</p>}
      {draft && (
        <div className="grid md:grid-cols-5 gap-5 text-sm">
          <div className="md:col-span-3 space-y-2">
            <div className="flex items-center justify-between"><div><span className="text-xs text-muted">件名</span><div className="font-medium">{draft.subject}</div></div><CopyButton text={`件名: ${draft.subject}\n\n${draft.body}`} label="件名＋本文をコピー" /></div>
            <pre className="whitespace-pre-wrap bg-bg rounded-md p-3 font-sans leading-relaxed">{draft.body}</pre>
            <Button size="sm" busy={busy} onClick={() => record("メール")}>このメールを送った → 記録</Button>
          </div>
          <div className="md:col-span-2 space-y-3">
            <div><div className="text-xs text-muted mb-1">電話でフォローするなら</div><pre className="whitespace-pre-wrap bg-bg rounded-md p-3 font-sans">{draft.call_script}</pre><Button size="sm" className="mt-2" busy={busy} onClick={() => record("電話")}>電話した → 記録</Button></div>
            <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-blue-900 text-xs"><b>次の一手</b><div className="mt-1">{draft.next_action}</div></div>
          </div>
        </div>
      )}
    </Modal>
  );
}
