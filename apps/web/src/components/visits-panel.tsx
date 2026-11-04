"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Customer, IcsSyncResult, VisitWithCustomer } from "@eigyo/core/shared";
import { Button, Card, Empty, inputCls, labelCls } from "./ui";

const pad = (n: number) => String(n).padStart(2, "0");
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

/** 訪問予定：今日〜2 週間の一覧、手入力、カレンダー（iCal URL）取り込み。 */
export function VisitsPanel({ visits, customers, icsUrl, google, flash }: { visits: VisitWithCustomer[]; customers: Pick<Customer, "id" | "short_name" | "name">[]; icsUrl: string | null; google: { configured: boolean; connected: boolean; email: string | null }; flash?: { ok: boolean; msg: string } | null }) {
  const router = useRouter();
  const [form, setForm] = useState({ date: todayStr(), time: "10:00", end: "", customer_id: "", title: "", place: "" });
  const [url, setUrl] = useState(icsUrl ?? "");
  const [icsText, setIcsText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const post = async (path: string, body: unknown, method = "POST") => {
    const r = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error ?? "失敗しました");
    return j;
  };
  const add = async () => {
    setBusy("add"); setErr(null); setMsg(null);
    try {
      await post("/api/visits", { starts_at: `${form.date} ${form.time}`, ends_at: form.end ? `${form.date} ${form.end}` : null, customer_id: form.customer_id ? Number(form.customer_id) : null, title: form.title, place: form.place });
      setForm({ ...form, title: "", place: "", customer_id: "" }); router.refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };
  const sync = async (mode: "url" | "text") => {
    setBusy(mode); setErr(null); setMsg(null);
    try {
      const j: IcsSyncResult | { cleared: true } = await post("/api/visits/sync", mode === "url" ? { ics_url: url } : { ics_text: icsText });
      setMsg("cleared" in j ? "解除しました" : `${j.fetched} 件（追加 ${j.created}・更新 ${j.updated}・削除 ${j.removed}）`);
      router.refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };
  const gsync = async (method: "POST" | "DELETE") => {
    setBusy("google"); setErr(null); setMsg(null);
    try {
      const r = await fetch("/api/google/sync", { method }); const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "失敗しました");
      setMsg(method === "DELETE" ? "解除しました" : `${j.fetched} 件（追加 ${j.created}・更新 ${j.updated}・削除 ${j.removed}）`);
      router.refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };
  const setCustomer = async (id: number, customerId: string) => { await post(`/api/visits/${id}`, { customer_id: customerId ? Number(customerId) : null }, "PATCH"); router.refresh(); };
  const remove = async (id: number) => { if (!confirm("この予定を消しますか？")) return; await fetch(`/api/visits/${id}`, { method: "DELETE" }); router.refresh(); };
  const byDay = new Map<string, VisitWithCustomer[]>();
  for (const v of visits) byDay.set(v.starts_at.slice(0, 10), [...(byDay.get(v.starts_at.slice(0, 10)) ?? []), v]);

  return (
    <div className="space-y-4">
      <Card title="予定を追加">
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-end text-sm">
          <div><label className={labelCls}>日付</label><input type="date" className={inputCls} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
          <div><label className={labelCls}>開始</label><input type="time" className={inputCls} value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></div>
          <div><label className={labelCls}>終了（任意）</label><input type="time" className={inputCls} value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></div>
          <div className="col-span-2 sm:col-span-2"><label className={labelCls}>得意先</label><select className={inputCls} value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })}><option value="">得意先（自動）</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.short_name}</option>)}</select></div>
          <div><Button variant="primary" className="w-full justify-center" busy={busy === "add"} onClick={add}>追加</Button></div>
          <div className="col-span-2 sm:col-span-3"><label className={labelCls}>件名（任意）</label><input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div className="col-span-2 sm:col-span-3"><label className={labelCls}>場所（任意）</label><input className={inputCls} value={form.place} onChange={(e) => setForm({ ...form, place: e.target.value })} /></div>
        </div>
      </Card>

      <Card title={`これからの訪問 ${visits.length}`}>
        {visits.length === 0 ? <Empty>予定なし</Empty> : (
          <div className="space-y-3">
            {[...byDay.entries()].map(([day, list]) => (
              <div key={day}>
                <div className="text-xs text-muted num mb-1">{day.replace(/-/g, "/")}{day === todayStr() ? "（今日）" : ""}</div>
                <ul className="divide-y divide-line">
                  {list.map((v) => (
                    <li key={v.id} className="py-2 flex flex-wrap items-center gap-2 text-sm">
                      <span className="num font-semibold w-12">{v.starts_at.slice(11, 16)}</span>
                      <span className="flex-1 min-w-[10rem]">{v.title}{v.place && <span className="text-xs text-muted">　{v.place}</span>}{v.source === "ics" && <span className="ml-1 text-[10px] rounded bg-gray-100 px-1 text-gray-600">カレンダー</span>}</span>
                      <select className={`${inputCls} w-44 text-xs`} value={v.customer_id ?? ""} onChange={(e) => setCustomer(v.id, e.target.value)}><option value="">得意先を選ぶ…</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.short_name}</option>)}</select>
                      {v.customer_id && <Link href={`/customers/${v.customer_id}/brief`} className="text-xs text-brand">ブリーフ</Link>}
                      <button type="button" className="text-xs text-muted hover:text-danger" onClick={() => remove(v.id)}>削除</button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>

      {flash && <p className={`text-sm ${flash.ok ? "text-ok" : "text-danger"}`}>{flash.msg}</p>}
      {google.configured && (
        <Card title="Google カレンダー">
          {google.connected ? (
            <div className="flex flex-wrap items-center gap-2 text-sm"><span className="text-ok font-semibold">連携中</span><span className="text-xs text-muted">{google.email ?? ""}</span><Button size="sm" variant="primary" busy={busy === "google"} onClick={() => gsync("POST")}>同期</Button><Button size="sm" variant="ghost" busy={busy === "google"} onClick={() => { if (confirm("Google カレンダーの連携を解除しますか？")) gsync("DELETE"); }}>解除</Button></div>
          ) : (
            <a href="/api/google/auth" className="inline-flex items-center rounded-md bg-brand text-brand-ink px-3.5 py-2 text-sm font-medium">Google カレンダーと連携</a>
          )}
        </Card>
      )}
      <Card title="カレンダー取り込み">
        <div className="flex flex-wrap gap-2 items-center">
          <input className={`${inputCls} flex-1 min-w-[16rem]`} placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" value={url} onChange={(e) => setUrl(e.target.value)} />
          <Button variant="primary" busy={busy === "url"} onClick={() => sync("url")}>{url.trim() ? "取り込む" : "解除"}</Button>
        </div>
        <details className="mt-3 text-xs"><summary className="cursor-pointer text-brand">.ics を貼り付ける</summary>
          <textarea className={`${inputCls} h-24 mt-2 font-mono text-[11px]`} placeholder="BEGIN:VCALENDAR …" value={icsText} onChange={(e) => setIcsText(e.target.value)} />
          <Button size="sm" className="mt-1" busy={busy === "text"} disabled={!icsText.trim()} onClick={() => sync("text")}>取り込む</Button>
        </details>
        {msg && <p className="text-xs text-ok mt-2">{msg}</p>}
        {err && <p className="text-xs text-danger mt-2">{err}</p>}
      </Card>
    </div>
  );
}
