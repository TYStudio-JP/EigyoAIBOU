"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { InquiryChannel } from "@eigyo/core/shared";
import { INQUIRY_CHANNEL_LABEL } from "@eigyo/core/shared";
import { Button, Card, inputCls, labelCls } from "./ui";
import { VoiceInput } from "./voice-input";

export function InquiryForm({ customers, initialText = "", initialCustomerId = null }: { customers: { id: number; short_name: string; name: string }[]; initialText?: string; initialCustomerId?: number | null }) {
  const router = useRouter();
  const [text, setText] = useState(initialText);
  const [customerId, setCustomerId] = useState<string>(initialCustomerId ? String(initialCustomerId) : "");
  const [channel, setChannel] = useState<InquiryChannel>("mail");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/inquiries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: text, customer_id: customerId ? Number(customerId) : null, channel, due: due || null }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error ?? "失敗しました");
      router.push(`/inquiries/${j.id}`);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
  };
  return (
    <Card>
      <div className="space-y-3">
        <VoiceInput value={text} onChange={setText} placeholder="例: 御社から買っている耐切創手袋 HK-5L の M サイズはありますか？ 納期も教えてください" rows={6} />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
          <div><label className={labelCls}>得意先</label><select className={inputCls} value={customerId} onChange={(e) => setCustomerId(e.target.value)}><option value="">— 文面から推定 —</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.short_name}</option>)}</select></div>
          <div><label className={labelCls}>届いた手段</label><select className={inputCls} value={channel} onChange={(e) => setChannel(e.target.value as InquiryChannel)}>{(Object.keys(INQUIRY_CHANNEL_LABEL) as InquiryChannel[]).map((k) => <option key={k} value={k}>{INQUIRY_CHANNEL_LABEL[k]}</option>)}</select></div>
          <div><label className={labelCls}>回答期限（任意）</label><input type="date" className={inputCls} value={due} onChange={(e) => setDue(e.target.value)} /></div>
        </div>
        <Button variant="primary" className="w-full justify-center" busy={busy} disabled={!text.trim()} onClick={save}>記録して回答を作る</Button>
        {err && <p className="text-sm text-danger">{err}</p>}
      </div>
    </Card>
  );
}
