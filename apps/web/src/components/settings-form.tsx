"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Settings } from "@eigyo/core/shared";
import { Button, Card, inputCls, labelCls } from "./ui";

export function SettingsForm({ initial, ai }: { initial: Settings; ai: { enabled: boolean; model: string } }) {
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
        </div>
      </Card>
      <Card title="AI 接続">
        <p className="text-sm">状態: {ai.enabled ? <span className="text-ok font-semibold">接続済み</span> : <span className="text-warn font-semibold">未設定</span>}　モデル: <code>{ai.model}</code></p>
        <p className="text-xs text-muted mt-1">リポジトリ直下の <code>.env</code> に <code>ANTHROPIC_API_KEY=sk-ant-...</code> を書いて再起動してください。モデルは <code>EIGYO_MODEL</code> で変更できます。</p>
      </Card>
      <div className="flex items-center gap-3">
        <Button variant="primary" busy={busy} onClick={save}>保存</Button>
        <Button variant="danger" busy={busy} onClick={reseed}>ダミーデータを再投入</Button>
        {msg && <span className="text-sm text-muted">{msg}</span>}
      </div>
    </div>
  );
}
