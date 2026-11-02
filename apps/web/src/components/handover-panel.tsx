"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CustomerOwnerRecord, User } from "@eigyo/core/shared";
import { Button, Card, inputCls, labelCls } from "./ui";
import { Modal } from "./modal";
import { dateJp } from "@/lib/format";

/** 得意先の担当ユーザー表示と、別ユーザーへの引継ぎ。 */
export function HandoverPanel({ customerId, owner, users, history, aiEnabled, meId }: { customerId: number; owner: User | null; users: User[]; history: CustomerOwnerRecord[]; aiEnabled: boolean; meId: number | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState<number | "">("");
  const [note, setNote] = useState("");
  const [useAi, setUseAi] = useState(aiEnabled);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const name = (id: number | null) => users.find((u) => u.id === id)?.name ?? "（未設定）";
  const run = async () => {
    if (!to) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/customers/${customerId}/handover`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to_user_id: to, note, use_ai: useAi }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setOpen(false); router.refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  return (
    <Card title="自社の担当" action={<div className="flex gap-2"><Link href={`/customers/${customerId}/handover`} className="text-xs text-brand hover:underline">引継ぎ書を見る</Link><Button size="sm" onClick={() => setOpen(true)}>別の担当者へ引き継ぐ</Button></div>}>
      <div className="text-sm">担当: <b>{owner?.name ?? "未設定"}</b>{owner?.department ? <span className="text-muted">（{owner.department}）</span> : null}{meId && owner?.id === meId && <span className="ml-2 text-xs text-ok">あなた</span>}</div>
      {history.length > 0 && (
        <ul className="mt-2 text-xs text-muted space-y-0.5">
          {history.map((h) => <li key={h.id}>{dateJp(h.handed_at)}　{name(h.from_user_id)} → {name(h.to_user_id)}{h.note ? `：${h.note}` : ""}　<Link href={`/customers/${customerId}/handover?record=${h.id}`} className="text-brand hover:underline">当時の引継ぎ書</Link></li>)}
        </ul>
      )}
      {open && (
        <Modal title="担当の引継ぎ" onClose={() => setOpen(false)}>
          <p className="text-sm text-muted mb-3">引継ぎを実行すると、進行中の各案件の経緯に「ここまでは前回の担当者 {owner?.name ?? "（未設定）"}」が記録され、引継ぎ書が保存されます。前任者の画面には「過去の担当先」として残ります。</p>
          <label className={labelCls}>引継ぎ先</label>
          <select className={`${inputCls} py-2.5`} value={to} onChange={(e) => setTo(e.target.value ? Number(e.target.value) : "")}><option value="">— 選択 —</option>{users.filter((u) => u.status === "active" && u.id !== owner?.id).map((u) => <option key={u.id} value={u.id}>{u.name}（{u.department}）</option>)}</select>
          <label className={`${labelCls} mt-3`}>申し送り（任意）</label>
          <textarea className={`${inputCls} h-20`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="例）転勤のため。年間契約の更新は1月。価格交渉は必ず相見積り。" />
          <label className="flex items-center gap-2 text-sm mt-3"><input type="checkbox" checked={useAi} disabled={!aiEnabled} onChange={(e) => setUseAi(e.target.checked)} />引継ぎ書を AI で読みやすく整える</label>
          {err && <p className="text-sm text-danger mt-2">{err}</p>}
          <div className="flex justify-end gap-2 mt-4"><Button onClick={() => setOpen(false)}>やめる</Button><Button variant="primary" busy={busy} onClick={run} disabled={!to}>引継ぎを実行</Button></div>
        </Modal>
      )}
    </Card>
  );
}
