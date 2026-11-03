"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ChatTurn } from "@eigyo/core/shared";
import { Button } from "./ui";

const SUGGEST = ["今日やることは？", "東海精密の状況を教えて", "エンドミル φ10 を 10 本、東海精密にいくらで出せる？", "納期回答待ちは？", "みどり食品に提案できる商品は？", "耐切創手袋のカットレベル規格を調べて", "今日の日報を作って"];

type Rec = { start(): void; stop(): void; lang: string; continuous: boolean; interimResults: boolean; onresult: ((e: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };

export function Chat({ initial, aiEnabled }: { initial: ChatTurn[]; aiEnabled: boolean }) {
  const [turns, setTurns] = useState<ChatTurn[]>(initial);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const rec = useRef<Rec | null>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [turns, busy]);

  const send = async (msg: string) => {
    const m = msg.trim();
    if (!m || busy) return;
    setText(""); setErr(null);
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    setTurns((t) => [...t, { role: "user", text: m, at: now }]);
    setBusy(true);
    try {
      const r = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: m }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setTurns((t) => [...t, { role: "assistant", text: j.reply, at: now, tools: j.tools_used, links: j.links }]);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const clear = async () => { await fetch("/api/chat", { method: "DELETE" }); setTurns([]); };
  const mic = () => {
    const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;
    if (listening) { rec.current?.stop(); return; }
    const r = new Ctor(); r.lang = "ja-JP"; r.continuous = false; r.interimResults = true;
    r.onresult = (e) => { let s = ""; for (let i = 0; i < e.results.length; i++) s += e.results[i][0].transcript; setText(s); };
    r.onend = () => setListening(false); r.onerror = () => setListening(false);
    rec.current = r; r.start(); setListening(true);
  };

  return (
    <div className="flex flex-col min-h-[60vh]">
      <div className="flex-1 space-y-3">
        {turns.length === 0 && (
          <div className="pt-6">
            <div className="text-sm text-muted mb-3">聞きたいことを書くか、話してください。</div>
            <div className="flex flex-wrap gap-2">{SUGGEST.map((s) => <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-left">{s}</button>)}</div>
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={`flex ${t.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[88%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${t.role === "user" ? "bg-brand text-brand-ink rounded-br-sm" : "bg-surface border border-line rounded-bl-sm"}`}>
              {t.text}
              {t.role === "assistant" && ((t.links?.length ?? 0) > 0 || (t.tools?.length ?? 0) > 0) && (
                <div className="mt-2 pt-2 border-t border-line flex flex-wrap gap-1.5">
                  {t.links?.map((l) => l.href.startsWith("http") ? <a key={l.href} href={l.href} target="_blank" rel="noreferrer" className="rounded-full bg-bg border border-line text-ink px-2.5 py-0.5 text-xs">🌐 {l.label}</a> : <Link key={l.href} href={l.href} className="rounded-full bg-brand/10 text-brand px-2.5 py-0.5 text-xs font-semibold">{l.label} →</Link>)}
                  {t.tools?.map((x) => <span key={x} className="rounded-full bg-bg text-muted px-2 py-0.5 text-[11px]">{x}</span>)}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && <div className="flex justify-start"><div className="rounded-2xl bg-surface border border-line px-4 py-2.5 text-sm text-muted">調べています…</div></div>}
        {err && <div className="text-sm text-danger">{err}</div>}
        <div ref={endRef} />
      </div>
      <div className="sticky bottom-[4.5rem] lg:bottom-4 mt-4 bg-bg pt-2">
        {!aiEnabled && <div className="text-xs text-muted mb-1">AI 機能は未接続です。<Link href="/settings" className="text-brand">設定で接続</Link></div>}
        <div className="flex items-end gap-2">
          <textarea className="flex-1 rounded-2xl border border-line bg-surface px-4 py-3 text-base leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand/30" rows={1} placeholder="質問や依頼" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(text); } }} />
          <button type="button" onClick={mic} className={`h-12 w-12 rounded-full border border-line ${listening ? "bg-danger text-white animate-pulse" : "bg-surface"}`} title="音声入力">🎤</button>
          <Button variant="primary" className="h-12 px-5 rounded-full" busy={busy} disabled={!aiEnabled || !text.trim()} onClick={() => send(text)}>送る</Button>
        </div>
        {turns.length > 0 && <div className="text-right mt-1"><button type="button" onClick={clear} className="text-xs text-muted hover:underline">会話をクリア</button></div>}
      </div>
    </div>
  );
}
