"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ShareItem } from "@eigyo/core/shared";
import { Button, Card, inputCls } from "./ui";

/** 共有された本文・写真の行き先：見積り／問い合わせ回答／写真で商品を調べる。 */
export function SharePick({ item }: { item: ShareItem | null }) {
  const router = useRouter();
  const [text, setText] = useState([item?.title, item?.text, item?.url].filter(Boolean).join("\n"));
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const isImage = Boolean(item?.file_mime?.startsWith("image/"));
  const toQuote = () => router.push(`/quotes/new?text=${encodeURIComponent(text.slice(0, 6000))}`);
  const toInquiry = async () => {
    setBusy("inq"); setErr(null);
    try {
      const r = await fetch("/api/inquiries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: text, channel: "mail", source: "share" }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error ?? "失敗しました");
      router.push(`/inquiries/${j.id}`);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };
  return (
    <div className="space-y-3">
      {item?.file_name && <Card title="添付"><p className="text-sm">{item.file_name} <span className="text-xs text-muted">{item.file_mime}</span></p>{isImage && <Button variant="primary" className="mt-2 w-full justify-center" onClick={() => router.push(`/products/photo?t=${item.token}`)}>📷 写真で調べる</Button>}</Card>}
      <Card title="本文">
        <textarea className={`${inputCls} h-40 font-sans`} value={text} onChange={(e) => setText(e.target.value)} placeholder="本文を貼り付け" />
        <div className="grid grid-cols-2 gap-2 mt-3">
          <Button variant="primary" className="justify-center" disabled={!text.trim()} onClick={toQuote}>✎ 見積りを作る</Button>
          <Button className="justify-center" disabled={!text.trim()} busy={busy === "inq"} onClick={toInquiry}>❓ 問い合わせに回答</Button>
        </div>
        {err && <p className="text-sm text-danger mt-2">{err}</p>}
      </Card>
    </div>
  );
}
