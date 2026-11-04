"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Customer, PricingMode } from "@eigyo/core/shared";
import { PRICING_MODE_LABEL, ROUNDING_UNITS, rulePrice, resolvePricingRule } from "@eigyo/core/shared";
import { Button, inputCls, labelCls } from "./ui";

/** 得意先の値付けルール（外出先でメーカー回答から即答するときの「いつものベース」）。 */
export function PricingRuleForm({ customer }: { customer: Pick<Customer, "id" | "pricing_mode" | "markup_rate" | "margin_pct" | "rounding_unit"> }) {
  const router = useRouter();
  const [mode, setMode] = useState<PricingMode>(customer.pricing_mode);
  const [markup, setMarkup] = useState(customer.markup_rate ?? 1.3);
  const [margin, setMargin] = useState(customer.margin_pct ?? 25);
  const [unit, setUnit] = useState(customer.rounding_unit || 1);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const rule = resolvePricingRule({ pricing_mode: mode, markup_rate: markup, margin_pct: margin, rounding_unit: unit }, null);
  const sample = rule ? rulePrice(1234, rule) : null;
  const save = async () => {
    setBusy(true); setMsg(null);
    const r = await fetch(`/api/customers/${customer.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pricing_mode: mode, markup_rate: mode === "markup" ? markup : null, margin_pct: mode === "margin" ? margin : null, rounding_unit: unit }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false); setMsg(r.ok ? "保存しました" : j.error ?? "失敗しました");
    if (r.ok) router.refresh();
  };
  return (
    <div className="text-sm space-y-3">
      <div className="grid sm:grid-cols-3 gap-3">
        <div>
          <label className={labelCls}>決め方</label>
          <select className={inputCls} value={mode} onChange={(e) => setMode(e.target.value as PricingMode)}>{(Object.keys(PRICING_MODE_LABEL) as PricingMode[]).map((k) => <option key={k} value={k}>{PRICING_MODE_LABEL[k]}</option>)}</select>
        </div>
        {mode === "markup" && <div><label className={labelCls}>掛率（仕入れ × この係数）</label><input type="number" step={0.01} min={0.5} max={9.99} className={`${inputCls} num`} value={markup} onChange={(e) => setMarkup(Number(e.target.value))} /></div>}
        {mode === "margin" && <div><label className={labelCls}>粗利率（%）</label><input type="number" step={0.5} min={1} max={99} className={`${inputCls} num`} value={margin} onChange={(e) => setMargin(Number(e.target.value))} /></div>}
        <div>
          <label className={labelCls}>端数（切り捨て）</label>
          <select className={inputCls} value={unit} onChange={(e) => setUnit(Number(e.target.value))}>{ROUNDING_UNITS.map((u) => <option key={u} value={u}>{u === 1 ? "1 円単位" : `${u} 円単位で切り捨て`}</option>)}</select>
        </div>
      </div>
      {mode !== "none" && <p className="text-xs text-muted num">仕入れ 1,234 円 → {sample?.toLocaleString()} 円</p>}
      <div className="flex items-center gap-3"><Button variant="primary" size="sm" busy={busy} onClick={save}>保存</Button>{msg && <span className="text-xs text-muted">{msg}</span>}</div>
    </div>
  );
}
