"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

type Rec = { start(): void; stop(): void; abort(): void; lang: string; continuous: boolean; interimResults: boolean; onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };
type RecCtor = new () => Rec;

/** ブラウザ標準の音声認識（iPhone Safari / Chrome / Edge）。無い環境はキーボードのマイク（ディクテーション）で同じ欄に入力できる。 */
export function VoiceInput({ value, onChange, placeholder, rows = 7 }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  // 音声認識の有無は外部（ブラウザ）の状態なので useSyncExternalStore で読む（SSR 時は null）
  const supported = useSyncExternalStore(() => () => {}, () => {
    const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
    return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
  }, () => null as boolean | null);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const rec = useRef<Rec | null>(null);
  const base = useRef(value);
  const latest = useRef(value);
  useEffect(() => { latest.current = value; }, [value]);

  const start = () => {
    const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;
    setErr(null);
    const r = new Ctor();
    r.lang = "ja-JP"; r.continuous = true; r.interimResults = true;
    base.current = latest.current ? latest.current.replace(/\s*$/, "") + "\n" : "";
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
    r.onerror = (e) => { setErr(e.error === "not-allowed" ? "マイクの使用が許可されていません。ブラウザの設定で許可してください。" : `音声認識エラー: ${e.error}`); setListening(false); };
    r.onend = () => { setListening(false); setInterim(""); };
    rec.current = r;
    r.start();
    setListening(true);
  };
  const stop = () => { rec.current?.stop(); setListening(false); };

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        {supported ? (
          <button type="button" onClick={listening ? stop : start}
            className={`flex-1 lg:flex-none inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-base font-semibold transition ${listening ? "bg-danger text-white animate-pulse" : "bg-brand text-brand-ink"}`}>
            {listening ? "■ 停止（聞き取り中…）" : "🎤 話して記録する"}
          </button>
        ) : supported === false ? (
          <span className="text-xs text-muted">このブラウザは音声認識に未対応です。キーボードのマイクボタン（音声入力）で下の欄に話してください。iPhone は Safari で開くと使えます。</span>
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
