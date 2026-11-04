"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Supplier } from "@eigyo/core/shared";
import { ROUTE_LABEL } from "@eigyo/core/shared";
import { Button, inputCls } from "./ui";

/** 仕入れ先ごとの標準掛率（得意先に値付けルールが無いときの既定）。 */
export function SupplierRules({ suppliers }: { suppliers: Supplier[] }) {
  const router = useRouter();
  const [rates, setRates] = useState<Record<number, string>>(Object.fromEntries(suppliers.map((s) => [s.id, s.markup_rate != null ? String(s.markup_rate) : ""])));
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const save = async (id: number) => {
    setBusy(id); setMsg(null);
    const v = rates[id]?.trim();
    const r = await fetch(`/api/suppliers/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ markup_rate: v ? Number(v) : null }) });
    const j = await r.json().catch(() => ({}));
    setBusy(null); setMsg(r.ok ? "保存しました" : j.error ?? "失敗しました");
    if (r.ok) router.refresh();
  };
  return (
    <div className="text-sm">
      <table className="w-full">
        <thead className="text-xs text-muted"><tr><th className="text-left font-normal py-1">仕入れ先</th><th className="text-left font-normal">ルート</th><th className="text-right font-normal">リードタイム</th><th className="text-right font-normal w-32">標準掛率</th><th className="w-16" /></tr></thead>
        <tbody>
          {suppliers.map((s) => (
            <tr key={s.id} className="border-t border-line">
              <td className="py-1.5">{s.name}</td>
              <td className="text-muted">{ROUTE_LABEL[s.route_type]}</td>
              <td className="text-right num text-muted">{s.lead_time_days} 日</td>
              <td className="text-right"><input type="number" step={0.01} min={0.5} max={9.99} placeholder="例 1.25" className={`${inputCls} num text-right`} value={rates[s.id] ?? ""} onChange={(e) => setRates({ ...rates, [s.id]: e.target.value })} /></td>
              <td className="text-right pl-2"><Button size="sm" busy={busy === s.id} onClick={() => save(s.id)}>保存</Button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {msg && <p className="text-xs text-muted mt-2">{msg}</p>}
    </div>
  );
}
