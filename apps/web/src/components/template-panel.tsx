"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui";

/** 自社書式の見積書テンプレート（xlsx）の登録・削除。 */
export function TemplatePanel({ registered }: { registered: boolean }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const upload = async () => {
    if (!file) return;
    setBusy("up"); setMsg(null);
    const fd = new FormData(); fd.append("file", file);
    const r = await fetch("/api/templates/quote", { method: "POST", body: fd });
    const j = await r.json().catch(() => ({}));
    setBusy(null); setMsg(r.ok ? "登録しました" : j.error ?? "失敗しました");
    if (r.ok) router.refresh();
  };
  const remove = async () => {
    if (!confirm("登録したテンプレートを削除して既定書式に戻しますか？")) return;
    setBusy("rm"); const r = await fetch("/api/templates/quote", { method: "DELETE" }); setBusy(null);
    setMsg(r.ok ? "既定書式に戻しました" : "失敗しました"); router.refresh();
  };
  return (
    <div className="text-sm space-y-3">
      <p>{registered ? <span className="text-ok font-semibold">自社書式</span> : <span className="text-muted">既定書式</span>}</p>
      <p className="text-xs"><a href="/api/templates/quote?sample=1" className="text-brand hover:underline">サンプル xlsx</a>　差し込み: <code>{"{{quote_no}}"}</code> <code>{"{{customer.name}}"}</code> <code>{"{{item.description}}"}</code> …</p>
      <div className="flex flex-wrap items-center gap-2">
        <input type="file" accept=".xlsx" className="text-xs" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <Button size="sm" variant="primary" busy={busy === "up"} disabled={!file} onClick={upload}>登録</Button>
        {registered && <><a href="/api/templates/quote?download=1" className="text-xs text-brand hover:underline">ダウンロード</a><Button size="sm" variant="ghost" busy={busy === "rm"} onClick={remove}>既定に戻す</Button></>}
      </div>
      {msg && <p className="text-xs text-muted">{msg}</p>}
    </div>
  );
}
