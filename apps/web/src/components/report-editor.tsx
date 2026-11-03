"use client";
import { useEffect, useState } from "react";
import { Button, Card, inputCls, labelCls } from "./ui";
import { CopyButton } from "./modal";

/** 営業日報：その日の事実から下書き → 一言メモ → AI 清書 → 保存／コピー。 */
export function ReportEditor({ initialDate, aiEnabled }: { initialDate: string; aiEnabled: boolean }) {
  const [date, setDate] = useState(initialDate);
  const [draft, setDraft] = useState("");
  const [body, setBody] = useState("");
  const [memo, setMemo] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      setBusy("load"); setErr(null);
      try { const r = await fetch(`/api/report?date=${date}`); const j = await r.json(); setDraft(j.draft); setSaved(j.saved); setBody(j.saved ?? j.draft); } catch (e) { setErr(String(e)); } finally { setBusy(null); }
    })();
  }, [date]);
  const polish = async () => {
    setBusy("ai"); setErr(null);
    try { const r = await fetch("/api/report/polish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draft, memo, date }) }); const j = await r.json(); if (!r.ok) throw new Error(j.error); setBody(j.body); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };
  const save = async () => {
    setBusy("save"); setErr(null);
    try { const text = memo && !body.includes(memo) ? body.replace("- （ここに一言）", `- ${memo}`) : body; await fetch("/api/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, body: text }) }); setBody(text); setSaved(text); } catch (e) { setErr(String(e)); } finally { setBusy(null); }
  };
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div><label className={labelCls}>日付</label><input type="date" className={`${inputCls} py-2.5`} value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="flex-1 min-w-[16rem]"><label className={labelCls}>所感</label><input className={`${inputCls} py-2.5`} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="一言" /></div>
          <Button variant="primary" busy={busy === "ai"} onClick={polish} disabled={!aiEnabled} title={aiEnabled ? "" : "設定で AI を接続すると使えます"}>清書する</Button>
        </div>
      </Card>
      <Card title={`日報 ${date.replace(/-/g, "/")}${saved ? "（保存済み）" : ""}`} action={<div className="flex gap-2"><CopyButton text={body} /><Button size="sm" variant="primary" busy={busy === "save"} onClick={save}>保存</Button></div>}>
        {busy === "load" ? <p className="text-sm text-muted">集計中…</p> : <textarea className={`${inputCls} font-sans leading-relaxed`} rows={22} value={body} onChange={(e) => setBody(e.target.value)} />}
        {err && <p className="text-sm text-danger mt-2">{err}</p>}
      </Card>
    </div>
  );
}
