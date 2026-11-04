"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

type Rec = { start(): void; stop(): void; abort(): void; lang: string; continuous: boolean; interimResults: boolean; onstart: (() => void) | null; onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };
type RecCtor = new () => Rec;

/**
 * ブラウザ標準の音声認識（iPhone Safari / Chrome / Edge）。無い環境はキーボードのマイク（ディクテーション）で同じ欄に入力できる。
 * 押した瞬間に「準備中」を出し、認識が始まったら経過秒数を表示する（マイク許可と起動で 1〜2 秒かかるのは正常）。
 */
export function VoiceInput({ value, onChange, placeholder, rows = 7 }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  // 音声認識の有無は外部（ブラウザ）の状態なので useSyncExternalStore で読む（SSR 時は null）
  const supported = useSyncExternalStore(() => () => {}, () => {
    const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
    return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
  }, () => null as boolean | null);
  const [phase, setPhase] = useState<"idle" | "starting" | "listening">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [interim, setInterim] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const rec = useRef<Rec | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const base = useRef(value);
  const latest = useRef(value);
  useEffect(() => { latest.current = value; }, [value]);
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); rec.current?.abort(); }, []);

  const stopTimer = () => { if (timer.current) { clearInterval(timer.current); timer.current = null; } };
  const start = () => {
    const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;
    setErr(null); setPhase("starting"); setElapsed(0);
    const r = new Ctor();
    r.lang = "ja-JP"; r.continuous = true; r.interimResults = true;
    base.current = latest.current ? latest.current.replace(/\s*$/, "") + "\n" : "";
    const startedAt = Date.now();
    r.onstart = () => {
      setPhase("listening");
      stopTimer();
      timer.current = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 500);
    };
    r.onresult = (e) => {
      let interimText = "";
      let finalText = "";
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText += res[0].transcript + "。";
        else interimText += res[0].transcript;
      }
      setInterim(interimText);
      onChange(base.current + finalText);
    };
    r.onerror = (e) => { setErr(e.error === "not-allowed" ? "マイクが許可されていません" : e.error === "no-speech" ? "音声が聞き取れませんでした" : `音声認識エラー: ${e.error}`); setPhase("idle"); stopTimer(); };
    r.onend = () => { setPhase("idle"); setInterim(""); stopTimer(); };
    rec.current = r;
    r.start();
  };
  const stop = () => { rec.current?.stop(); setPhase("idle"); stopTimer(); };
  const mmss = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        {supported ? (
          <button type="button" onClick={phase === "idle" ? start : stop} disabled={phase === "starting"}
            className={`flex-1 lg:flex-none inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-base font-semibold transition ${phase === "listening" ? "bg-danger text-white" : phase === "starting" ? "bg-brand/60 text-brand-ink" : "bg-brand text-brand-ink"}`}>
            {phase === "listening" ? <><span className="inline-block w-2.5 h-2.5 rounded-full bg-white animate-pulse" />停止 <span className="num">{mmss}</span></> : phase === "starting" ? <><span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />準備中</> : "🎤 話す"}
          </button>
        ) : supported === false ? (
          <span className="text-xs text-muted">キーボードのマイクから入力</span>
        ) : null}
      </div>
      <textarea
        className="w-full rounded-lg border border-line px-3 py-3 text-base leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand/30"
        rows={rows}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {interim && <div className="text-sm text-muted mt-1">…{interim}</div>}
      {err && <div className="text-sm text-danger mt-1">{err}</div>}
    </div>
  );
}
