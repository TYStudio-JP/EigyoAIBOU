"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CallWithCustomer, Contact, Customer } from "@eigyo/core/shared";
import { VoiceInput } from "./voice-input";
import { Button, inputCls, labelCls } from "./ui";

const EXAMPLE = "東海精密の佐藤さんから。エンドミルφ10の単価、競合が7,000円出してきたからなんとかならないかって。あと切削油18Lを8缶、来週水曜までに。防錆スプレー24本入りの在庫も聞かれた。来週火曜に訪問の約束。";

/** 電話メモ入力（新規 or 既存の通話に追記）。保存して AI 処理へ。 */
export function CallMemo({ call, customers, contacts, aiEnabled, autostart }: { call: CallWithCustomer | null; customers: Customer[]; contacts: Contact[]; aiEnabled: boolean; autostart?: boolean }) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState<number | "">(call?.customer_id ?? "");
  const [contactId, setContactId] = useState<number | "">(call?.contact_id ?? "");
  const myContacts = contacts.filter((c) => c.customer_id === customerId);
  const [q, setQ] = useState("");
  const [direction, setDirection] = useState<"in" | "out" | "unknown">(call?.direction ?? "in");
  const [memo, setMemo] = useState(call?.memo ?? "");
  const [busy, setBusy] = useState<"save" | "process" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const filtered = q ? customers.filter((c) => (c.name + c.short_name + c.code + (c.contact_name ?? "")).includes(q)) : customers;

  const ensureCall = async (): Promise<number> => {
    if (call) {
      await fetch(`/api/calls/${call.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ memo, customer_id: customerId || null, contact_id: contactId || null, direction }) });
      return call.id;
    }
    const r = await fetch("/api/calls", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ memo, customer_id: customerId || null, contact_id: contactId || null, direction, source: "manual" }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error);
    return j.id;
  };
  const save = async () => {
    setBusy("save"); setErr(null);
    try { const id = await ensureCall(); router.push(`/calls/${id}`); router.refresh(); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(null); }
  };
  const process = async () => {
    if (!memo.trim()) { setErr("メモが空です。話すか入力してください。"); return; }
    setBusy("process"); setErr(null);
    try {
      const id = await ensureCall();
      const r = await fetch(`/api/calls/${id}/process`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      router.push(`/calls/${id}`); router.refresh();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(null); }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <label className={labelCls}>得意先 {call?.tel && <span className="text-muted">（着信番号 {call.tel}{call.customer ? "・自動判定" : "・未登録の番号"}）</span>}</label>
          <div className="flex gap-2">
            <input className={`${inputCls} py-3 text-base`} placeholder="社名・担当者で絞り込み" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className={`${inputCls} py-3 text-base ${!customerId ? "border-warn" : ""}`} value={customerId} onChange={(e) => { setCustomerId(e.target.value ? Number(e.target.value) : ""); setContactId(""); }}>
              <option value="">— 得意先を選ぶ —</option>
              {filtered.map((c) => <option key={c.id} value={c.id}>{c.short_name}</option>)}
            </select>
          </div>
          {customerId && myContacts.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="text-xs text-muted self-center">相手:</span>
              {myContacts.map((c) => <button key={c.id} type="button" onClick={() => setContactId(contactId === c.id ? "" : c.id)} className={`rounded-full border px-3 py-1 text-sm ${contactId === c.id ? "bg-brand text-brand-ink border-brand" : "border-line bg-surface"}`}>{c.name}</button>)}
              <span className="text-[11px] text-muted self-center">（未選択でも名乗りから自動判定）</span>
            </div>
          )}
        </div>
        <div>
          <label className={labelCls}>方向</label>
          <div className="grid grid-cols-3 gap-1">
            {(["in", "out", "unknown"] as const).map((d) => (
              <button key={d} type="button" onClick={() => setDirection(d)} className={`rounded-md border py-3 text-sm ${direction === d ? "bg-brand text-brand-ink border-brand" : "border-line bg-surface"}`}>{{ in: "着信", out: "発信", unknown: "不明" }[d]}</button>
            ))}
          </div>
        </div>
      </div>
      <div>
        <label className={labelCls}>電話の内容（切った直後に 30 秒、思い出せる順で OK。数量・価格・納期・約束したことを）</label>
        <VoiceInput value={memo} onChange={setMemo} placeholder={`例）${EXAMPLE}`} />
        {!memo && <button type="button" className="text-xs text-brand hover:underline mt-1" onClick={() => setMemo(EXAMPLE)}>例文を入れる</button>}
      </div>
      {err && <p className="text-sm text-danger">{err}</p>}
      <div className="flex flex-col lg:flex-row gap-2 lg:justify-end">
        <Button busy={busy === "save"} onClick={save} className="justify-center py-3 text-base">メモだけ保存</Button>
        <Button variant="primary" busy={busy === "process"} onClick={process} disabled={!aiEnabled} className="justify-center py-3 text-base" title={aiEnabled ? "" : "API キー未設定"}>
          {busy === "process" ? "議事録を作り、依頼を処理しています…" : "営業AI棒に処理させる（議事録・回答・確認メール）"}
        </Button>
      </div>
      {autostart && <p className="text-xs text-muted">通話が終わりました。上のボタンを押して話してください。</p>}
    </div>
  );
}
