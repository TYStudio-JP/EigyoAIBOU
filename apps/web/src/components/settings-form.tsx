"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Settings, User } from "@eigyo/core/shared";
import { Button, Card, inputCls, labelCls } from "./ui";
import { ImportPanel } from "./import-panel";
import { TemplatePanel } from "./template-panel";

export function SettingsForm({ initial, ai, users, meId, selfMail, templateRegistered = false }: { initial: Settings; ai: { enabled: boolean; model: string }; users: User[]; meId: number | null; selfMail?: { smtp: boolean; host: string | null; to: string | null }; templateRegistered?: boolean }) {
  const [newUser, setNewUser] = useState({ name: "", department: "" });
  const [targets, setTargets] = useState<Record<number, { sales: string; margin: string; email: string }>>(Object.fromEntries(users.map((u) => [u.id, { sales: u.target_sales != null ? String(u.target_sales) : "", margin: u.target_margin != null ? String(u.target_margin) : "", email: u.email ?? "" }])));
  const saveUser = async (u: User) => {
    const t = targets[u.id];
    const r = await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: u.id, email: t.email.trim() || null, target_sales: t.sales.trim() ? Number(t.sales.replace(/,/g, "")) : null, target_margin: t.margin.trim() ? Number(t.margin.replace(/,/g, "")) : null }) });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? `${u.name} の設定を保存しました` : j.error ?? "失敗しました"); router.refresh();
  };
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS({ ...s, [k]: v });
  const save = async () => {
    setBusy(true);
    await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) });
    setBusy(false); setMsg("保存しました"); router.refresh();
  };
  const reseed = async () => {
    if (!confirm("見積り・得意先・商品をすべて削除してダミーデータを入れ直します。よろしいですか？")) return;
    setBusy(true);
    await fetch("/api/seed", { method: "POST" });
    setBusy(false); setMsg("ダミーデータを再投入しました"); router.refresh();
  };
  const field = (k: keyof Settings, label: string, type = "text") => (
    <div key={k}><label className={labelCls}>{label}</label><input type={type} className={`${inputCls} ${type === "number" ? "num" : ""}`} value={String(s[k])} onChange={(e) => set(k, (type === "number" ? Number(e.target.value) : e.target.value) as never)} /></div>
  );
  return (
    <div className="space-y-4 max-w-3xl">
      <Card title="自社情報（見積書に印字）">
        <div className="grid md:grid-cols-2 gap-3">
          {field("company_name", "会社名")}{field("sales_rep", "担当者（部署・氏名）")}{field("company_address", "住所")}{field("company_tel", "電話")}
        </div>
      </Card>
      <Card title="価格チェックのしきい値">
        <div className="grid md:grid-cols-3 gap-3">
          {field("margin_floor_pct", "粗利率の下限（%）— 下回ると警告", "number")}
          {field("margin_target_pct", "推奨粗利率（%）— 新規品の提案価格に使用", "number")}
          {field("last_price_drop_warn_pct", "前回単価からの値下げ警告（%）", "number")}
        </div>
      </Card>
      <Card title="追跡（フォローアップ）">
        <div className="grid md:grid-cols-3 gap-3">
          {field("followup_days_first", "提出後、最初のフォローまで（日）", "number")}
          {field("followup_days_repeat", "以降のフォロー間隔（日）", "number")}
          {field("quote_valid_days", "見積り有効期間（日）", "number")}
          {field("brief_switch_minutes", "ホームを「次の訪問」に切り替える（訪問の何分前から）", "number")}
        </div>
      </Card>
      <Card title="ユーザー（自社の営業担当）— メール・月の目標・代理送付">
        <div id="users" />
        <ul className="divide-y divide-line text-sm">
          {users.map((u) => (
            <li key={u.id} className="py-2 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className={`flex-1 ${u.status === "inactive" ? "text-muted" : ""}`}>{u.name} <span className="text-xs text-muted">{u.department}{u.status === "inactive" ? "・無効" : ""}</span></span>
                {meId === u.id ? <span className="text-xs text-ok">操作中</span> : <Button size="sm" onClick={async () => { await fetch("/api/users/switch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: u.id }) }); router.refresh(); }}>このユーザーで操作</Button>}
                <Button size="sm" variant="ghost" onClick={async () => { await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: u.id, status: u.status === "active" ? "inactive" : "active" }) }); router.refresh(); }}>{u.status === "active" ? "無効にする" : "有効にする"}</Button>
              </div>
              <div className="grid sm:grid-cols-5 gap-2 items-end">
                <div className="sm:col-span-2"><label className={labelCls}>メール（自分宛て送信の宛先）</label><input className={inputCls} value={targets[u.id]?.email ?? ""} onChange={(e) => setTargets({ ...targets, [u.id]: { ...targets[u.id], email: e.target.value } })} /></div>
                <div><label className={labelCls}>月の売上目標（税抜）</label><input inputMode="numeric" className={`${inputCls} num`} placeholder="例 5000000" value={targets[u.id]?.sales ?? ""} onChange={(e) => setTargets({ ...targets, [u.id]: { ...targets[u.id], sales: e.target.value } })} /></div>
                <div><label className={labelCls}>月の粗利目標</label><input inputMode="numeric" className={`${inputCls} num`} placeholder="例 1200000" value={targets[u.id]?.margin ?? ""} onChange={(e) => setTargets({ ...targets, [u.id]: { ...targets[u.id], margin: e.target.value } })} /></div>
                <div><Button size="sm" variant="primary" onClick={() => saveUser(u)}>保存</Button></div>
              </div>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={Boolean(u.proxy_send_allowed)} onChange={async (e) => { await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: u.id, proxy_send_allowed: e.target.checked }) }); router.refresh(); }} />
                代理送付を許可する（会議・出張中など、本人が画面で内容を確認・承認したときだけ、アプリから得意先へ直接メールできる。CC に本人。履歴が残る）
              </label>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2 mt-3 items-end">
          <div><label className={labelCls}>氏名</label><input className={inputCls} value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} /></div>
          <div><label className={labelCls}>部署</label><input className={inputCls} value={newUser.department} onChange={(e) => setNewUser({ ...newUser, department: e.target.value })} /></div>
          <Button size="sm" disabled={!newUser.name.trim()} onClick={async () => { await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newUser) }); setNewUser({ name: "", department: "" }); router.refresh(); }}>追加</Button>
        </div>
      </Card>
      <Card title="AI">
        <p className="text-sm">状態: {ai.enabled ? <span className="text-ok font-semibold">接続済み</span> : <span className="text-warn font-semibold">未設定</span>}　モデル: <code>{ai.model}</code></p>
        {!ai.enabled && <p className="text-xs text-muted mt-1">営業AI棒のフォルダにある <code>.env</code> に <code>ANTHROPIC_API_KEY=（API キー）</code> を書き、再起動すると接続されます。</p>}
      </Card>
      <Card title="マスタの取り込み（CSV）"><ImportPanel /></Card>
      <Card title="見積書の書式（自社テンプレート）"><TemplatePanel registered={templateRegistered} /></Card>
      <Card title="自分宛てメール（スマホから見積書を自分に送る）">
        <p className="text-sm">送信方法: {selfMail?.smtp ? <span className="text-ok font-semibold">メール送信（SMTP: {selfMail.host}）</span> : <span className="text-warn font-semibold">未設定 → スマホの共有メニュー／メールアプリで送ります</span>}　宛先: {selfMail?.to ? <b>{selfMail.to}</b> : <span className="text-warn">未設定</span>}</p>
        <p className="text-xs text-muted mt-1">営業AI棒は得意先に直接送りません。宛先は操作中ユーザーのメール（上のユーザー欄）、無ければ <code>.env</code> の <code>EIGYO_SELF_EMAIL</code>。アプリから直接メールするには <code>.env</code> に <code>EIGYO_SMTP_HOST</code> / <code>EIGYO_SMTP_PORT</code> / <code>EIGYO_SMTP_USER</code> / <code>EIGYO_SMTP_PASS</code> / <code>EIGYO_SMTP_FROM</code> を設定して再起動します。</p>
      </Card>
      <div className="flex items-center gap-3">
        <Button variant="primary" busy={busy} onClick={save}>保存</Button>
        <Button variant="danger" busy={busy} onClick={reseed}>ダミーデータを再投入</Button>
        {msg && <span className="text-sm text-muted">{msg}</span>}
      </div>
    </div>
  );
}
