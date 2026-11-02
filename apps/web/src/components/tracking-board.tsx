"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FollowupItem } from "@eigyo/core/shared";
import { Button, Card, Empty, inputCls } from "./ui";
import { UrgencyPill } from "./urgency";
import { FollowupModal } from "./followup-modal";
import { dateJp, yen } from "@/lib/format";

const GROUPS: { key: FollowupItem["urgency"]; title: string; hint: string }[] = [
  { key: "overdue", title: "フォロー期限を超過", hint: "放置すると他社に流れます。今日中に一報を。" },
  { key: "due", title: "今日フォローする", hint: "提出から規定日数が経過。検討状況を確認。" },
  { key: "soon", title: "近日", hint: "明日あたりに連絡予定。" },
  { key: "fresh", title: "様子見", hint: "提出直後。まだ急がなくてOK。" },
];

export function TrackingBoard({ items, aiEnabled }: { items: FollowupItem[]; aiEnabled: boolean }) {
  const router = useRouter();
  const [draftFor, setDraftFor] = useState<FollowupItem | null>(null);
  const [noteFor, setNoteFor] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const record = async (quoteId: number) => {
    if (!note.trim()) return;
    setBusy(true);
    await fetch(`/api/quotes/${quoteId}/activities`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "followup", body: note }) });
    setBusy(false); setNote(""); setNoteFor(null); router.refresh();
  };
  return (
    <div className="space-y-4">
      {GROUPS.map((g) => {
        const rows = items.filter((i) => i.urgency === g.key);
        return (
          <Card key={g.key} title={<span className="flex items-center gap-2"><UrgencyPill urgency={g.key} />{g.title}<span className="text-muted font-normal">（{rows.length}）</span></span>} action={<span className="text-xs text-muted">{g.hint}</span>}>
            {rows.length === 0 ? <Empty>なし</Empty> : (
              <ul className="divide-y divide-line">
                {rows.map((f) => (
                  <li key={f.quote.id} className="py-3">
                    <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2"><Link href={`/quotes/${f.quote.id}`} className="font-semibold hover:underline">{f.quote.customer_name}</Link><span className="text-muted text-sm truncate">{f.quote.subject}</span><span className="text-xs text-muted num">{f.quote.quote_no}</span></div>
                        <div className="text-xs text-muted mt-0.5">提出 {dateJp(f.quote.submitted_at)}（{f.days_since_submit}日前）／ 最終フォロー {f.quote.last_followup_at ? `${dateJp(f.quote.last_followup_at)}（${f.days_since_last_touch}日前）` : "未実施"} ／ 有効期限 {dateJp(f.quote.valid_until)}</div>
                        <div className="text-sm mt-1">→ {f.suggestion}</div>
                      </div>
                      <div className="sm:text-right num font-semibold">{yen(f.quote.total)}</div>
                      <div className="flex sm:flex-col gap-1.5 shrink-0">
                        <Button size="sm" variant="primary" onClick={() => setDraftFor(f)} disabled={!aiEnabled} title={aiEnabled ? "" : "API キー未設定"}>AI でフォロー文面</Button>
                        <Button size="sm" onClick={() => { setNoteFor(noteFor === f.quote.id ? null : f.quote.id); setNote(""); }}>フォローを記録</Button>
                      </div>
                    </div>
                    {noteFor === f.quote.id && (
                      <div className="mt-2 flex gap-2">
                        <input autoFocus className={inputCls} placeholder="例）電話で確認。購買で相見積り中、来週回答。" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && record(f.quote.id)} />
                        <Button size="sm" variant="primary" busy={busy} onClick={() => record(f.quote.id)}>記録</Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        );
      })}
      {draftFor && <FollowupModal quoteId={draftFor.quote.id} quoteNo={draftFor.quote.quote_no} onClose={() => setDraftFor(null)} onRecorded={() => router.refresh()} />}
    </div>
  );
}
