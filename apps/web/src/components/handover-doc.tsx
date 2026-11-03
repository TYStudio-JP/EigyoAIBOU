"use client";
import { useState } from "react";
import { Button, Card } from "./ui";
import { CopyButton } from "./modal";

export function HandoverDoc({ customerId, initial, aiEnabled }: { customerId: number; initial: string; aiEnabled: boolean }) {
  const [md, setMd] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const polish = async () => {
    setBusy(true); setErr(null);
    try { const r = await fetch(`/api/customers/${customerId}/handover-doc`, { method: "POST" }); const j = await r.json(); if (!r.ok) throw new Error(j.error); setMd(j.markdown); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  return (
    <Card action={<div className="no-print flex gap-2"><CopyButton text={md} label="コピー" /><Button size="sm" onClick={() => window.print()}>印刷</Button>{aiEnabled && <Button size="sm" variant="primary" busy={busy} onClick={polish}>清書する</Button>}</div>} title="引継ぎ書">
      {err && <p className="text-sm text-danger mb-2">{err}</p>}
      <pre className="whitespace-pre-wrap text-sm font-sans leading-relaxed">{md}</pre>
    </Card>
  );
}
