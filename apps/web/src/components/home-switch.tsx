"use client";
import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import type { HomeMode, VisitWithCustomer } from "@eigyo/core/shared";
import { dateOf } from "@eigyo/core/shared";

/**
 * ホームの先頭：「返事待ち｜次の訪問」。
 * 次の訪問まで switchMinutes 以内（または訪問中）なら自動で「次の訪問」。手で切り替えたら、そのページを開いている間は手動が優先。
 * 1 分ごとに時刻を見直すので、開きっぱなしでも 10 分前に切り替わる。
 */
function findNext(visits: VisitWithCustomer[], now: number) {
  for (const v of visits) {
    const start = dateOf(v.starts_at).getTime();
    const end = v.ends_at ? dateOf(v.ends_at).getTime() : start + 60 * 60_000;
    const minutes = Math.round((start - now) / 60_000);
    if (minutes >= 0) return { v, minutes, inProgress: false };
    if (now <= Math.max(end, start + 90 * 60_000)) return { v, minutes, inProgress: true };
  }
  return null;
}

// 「今が何分か」を 1 分刻みで配る外部ストア（描画中に Date.now() を呼ばず、サーバーの時刻で初回描画を揃える）
const tick = { listeners: new Set<() => void>(), timer: null as ReturnType<typeof setInterval> | null };
function subscribeMinute(cb: () => void) {
  tick.listeners.add(cb);
  if (!tick.timer) tick.timer = setInterval(() => tick.listeners.forEach((l) => l()), 60_000);
  return () => { tick.listeners.delete(cb); if (tick.listeners.size === 0 && tick.timer) { clearInterval(tick.timer); tick.timer = null; } };
}
const minuteNow = () => Math.floor(Date.now() / 60_000);

export function HomeSwitch({ initialMode, serverNow, visits, switchMinutes, inbox, brief, inboxCount }: { initialMode: HomeMode; serverNow: number; visits: VisitWithCustomer[]; switchMinutes: number; inbox: React.ReactNode; brief: React.ReactNode | null; inboxCount: number }) {
  const [manual, setManual] = useState<HomeMode | null>(null);
  const minute = useSyncExternalStore(subscribeMinute, minuteNow, () => Math.floor(serverNow / 60_000));
  const nowMs = minute * 60_000;
  const next = findNext(visits, nowMs);
  const auto: HomeMode = next && next.v.customer_id && brief && next.minutes <= switchMinutes ? "brief" : "inbox";
  const mode: HomeMode = manual ?? (minute === Math.floor(serverNow / 60_000) ? initialMode : auto);
  const todayList = visits.filter((v) => v.starts_at.slice(0, 10) === localDate(nowMs));

  return (
    <div className="mb-4 space-y-2">
      {/* 今日の訪問タイムライン */}
      <div className="flex items-center gap-2 overflow-x-auto text-xs pb-0.5">
        <span className="shrink-0 text-muted">今日の訪問</span>
        {todayList.length === 0 && <Link href="/visits" className="shrink-0 rounded-full border border-dashed border-line px-2.5 py-1 text-muted">＋追加</Link>}
        {todayList.map((v) => {
          const isNext = next?.v.id === v.id;
          const past = dateOf(v.starts_at).getTime() < nowMs && !isNext;
          return <Link key={v.id} href={v.customer_id ? `/customers/${v.customer_id}/brief` : "/visits"} className={`shrink-0 rounded-full px-2.5 py-1 border ${isNext ? "bg-brand text-brand-ink border-brand font-semibold" : past ? "border-line text-muted line-through" : "border-line bg-surface"}`}>{v.starts_at.slice(11, 16)} {v.customer?.short_name ?? v.title}</Link>;
        })}
        {todayList.length > 0 && <Link href="/visits" className="shrink-0 text-brand">編集</Link>}
      </div>
      {/* 切替 */}
      <div className="flex items-center gap-2">
        <div className="grid grid-cols-2 rounded-lg border border-line bg-surface p-0.5 text-sm flex-1">
          <button type="button" onClick={() => setManual("inbox")} className={`rounded-md py-1.5 ${mode === "inbox" ? "bg-brand text-brand-ink font-semibold" : "text-muted"}`}>返事待ち{inboxCount ? `（${inboxCount}）` : ""}</button>
          <button type="button" onClick={() => setManual("brief")} disabled={!brief} className={`rounded-md py-1.5 ${mode === "brief" ? "bg-brand text-brand-ink font-semibold" : "text-muted"} disabled:opacity-40`}>次の訪問{next ? (next.inProgress ? "（訪問中）" : next.minutes <= 120 ? `（あと ${next.minutes} 分）` : `（${next.v.starts_at.slice(11, 16)}）`) : ""}</button>
        </div>
        {manual && manual !== auto && <button type="button" className="text-[11px] text-brand" onClick={() => setManual(null)}>自動</button>}
      </div>
      {mode === "brief" && brief ? brief : inbox}
    </div>
  );
}
function localDate(ms: number): string { const d = new Date(ms); const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }
