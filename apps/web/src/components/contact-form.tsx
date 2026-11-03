"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BusinessCard, Contact, Customer } from "@eigyo/core/shared";
import { Button, Card, inputCls, labelCls } from "./ui";

/** 担当者の登録・編集。名刺の写真から読み取って埋めることもできる（スマホはカメラ起動）。 */
export function ContactForm({ customers, customerId, contact, aiEnabled }: { customers: Customer[]; customerId?: number; contact?: Contact; aiEnabled: boolean }) {
  const router = useRouter();
  const [f, setF] = useState({
    customer_id: contact?.customer_id ?? customerId ?? ("" as number | ""), name: contact?.name ?? "", department: contact?.department ?? "", title: contact?.title ?? "",
    tel: contact?.tel ?? "", mobile: contact?.mobile ?? "", email: contact?.email ?? "", status: contact?.status ?? "active", notes: contact?.notes ?? "",
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [cardNote, setCardNote] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string | number) => setF({ ...f, [k]: v });

  const readCard = async (file: File) => {
    setBusy("card"); setErr(null); setCardNote(null);
    try {
      const fd = new FormData(); fd.set("image", file);
      const r = await fetch("/api/contacts/card", { method: "POST", body: fd });
      const j = (await r.json()) as { card: BusinessCard; customer_candidates: Customer[]; error?: string };
      if (!r.ok) throw new Error(j.error);
      const c = j.card;
      setF((prev) => ({
        ...prev, name: c.name ?? prev.name, department: c.department ?? prev.department, title: c.title ?? prev.title, tel: c.tel ?? prev.tel, mobile: c.mobile ?? prev.mobile, email: c.email ?? prev.email,
        notes: [prev.notes, c.notes].filter(Boolean).join("\n"), customer_id: prev.customer_id || (j.customer_candidates[0]?.id ?? ""),
      }));
      setCardNote(j.customer_candidates.length ? `得意先: ${j.customer_candidates[0].name}` : `「${c.company ?? "会社名不明"}」は未登録の会社です。得意先を選んでください`);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  };
  const save = async () => {
    if (!f.customer_id || !f.name.trim()) { setErr("得意先と氏名は必須です"); return; }
    setBusy("save"); setErr(null);
    try {
      const payload = { ...f, tel: f.tel || null, mobile: f.mobile || null, email: f.email || null, source: cardNote ? "card" : "manual" };
      const r = contact ? await fetch(`/api/contacts/${contact.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }) : await fetch("/api/contacts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      router.push(`/contacts/${j.id}`); router.refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(null); }
  };
  return (
    <Card title={contact ? "担当者を編集" : "担当者を追加"}>
      {!contact && (
        <div className="mb-4 rounded-lg border border-dashed border-brand/40 bg-brand/5 p-3">
          <label className="block text-sm font-semibold mb-1">📷 名刺から登録</label>
          <input type="file" accept="image/*" capture="environment" className="text-sm" disabled={!aiEnabled || busy === "card"} onChange={(e) => e.target.files?.[0] && readCard(e.target.files[0])} />
          <div className="text-xs text-muted mt-1">{aiEnabled ? (busy === "card" ? "読み取り中…" : "") : "設定で AI を接続すると使えます"}</div>
          {cardNote && <div className="text-xs text-ok mt-1">{cardNote}</div>}
        </div>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="lg:col-span-2"><label className={labelCls}>得意先</label><select className={`${inputCls} py-2.5`} value={f.customer_id} onChange={(e) => set("customer_id", e.target.value ? Number(e.target.value) : "")} disabled={Boolean(contact)}><option value="">— 選択 —</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.code} {c.name}</option>)}</select></div>
        <div><label className={labelCls}>氏名</label><input className={`${inputCls} py-2.5`} value={f.name} onChange={(e) => set("name", e.target.value)} /></div>
        <div><label className={labelCls}>部署</label><input className={`${inputCls} py-2.5`} value={f.department} onChange={(e) => set("department", e.target.value)} /></div>
        <div><label className={labelCls}>役職</label><input className={`${inputCls} py-2.5`} value={f.title} onChange={(e) => set("title", e.target.value)} /></div>
        <div><label className={labelCls}>在籍状況</label><select className={`${inputCls} py-2.5`} value={f.status} onChange={(e) => set("status", e.target.value)}><option value="active">在籍</option><option value="transferred">異動</option><option value="retired">退職</option></select></div>
        <div><label className={labelCls}>電話</label><input className={`${inputCls} py-2.5`} value={f.tel} onChange={(e) => set("tel", e.target.value)} inputMode="tel" /></div>
        <div><label className={labelCls}>携帯</label><input className={`${inputCls} py-2.5`} value={f.mobile} onChange={(e) => set("mobile", e.target.value)} inputMode="tel" /></div>
        <div className="lg:col-span-2"><label className={labelCls}>メール</label><input className={`${inputCls} py-2.5`} value={f.email} onChange={(e) => set("email", e.target.value)} inputMode="email" /></div>
        <div className="lg:col-span-2"><label className={labelCls}>メモ</label><textarea className={`${inputCls} h-20`} value={f.notes} onChange={(e) => set("notes", e.target.value)} /></div>
      </div>
      {err && <p className="text-sm text-danger mt-2">{err}</p>}
      <div className="flex justify-end mt-4"><Button variant="primary" busy={busy === "save"} onClick={save} className="py-3 px-6">保存</Button></div>
    </Card>
  );
}
