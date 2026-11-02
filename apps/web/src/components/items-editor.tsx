"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DraftItem } from "@/lib/draft";
import { ROUTE_LABEL, type PriceCheck } from "@eigyo/core/shared";
import { Button, LevelBadge, inputCls } from "./ui";
import { ProductPicker, type ProductLite } from "./product-picker";
import { dateJp, pct, yen } from "@/lib/format";

export const emptyItem = (): DraftItem => ({
  raw_text: "", product_query: "", product_id: null, product: null, candidates: [], description: "", qty: 1, unit: "個", unit_price: 0, cost: 0,
  supplier_id: null, supplier_options: [], proposal: null, checks: [], remarks: "", is_new_for_customer: false, note: null,
});

export function worst(checks: PriceCheck[]): "ok" | "info" | "warn" | "danger" {
  const o = ["ok", "info", "warn", "danger"] as const;
  return checks.reduce<(typeof o)[number]>((w, c) => (o.indexOf(c.level) > o.indexOf(w) ? c.level : w), "ok");
}

export function ItemsEditor({ customerId, items, onChange, excludeQuoteId, onInquiry }: {
  customerId: number | null; items: DraftItem[]; onChange: (items: DraftItem[]) => void; excludeQuoteId?: number;
  onInquiry?: (item: DraftItem) => void;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(items);
  useEffect(() => { latest.current = items; }, [items]);

  /** 明細をサーバーで照合し直す。resetIdx の行は単価を提案値で置き換える。 */
  const reprice = useCallback((next: DraftItem[], resetIdx: number[] = []) => {
    onChange(next);
    if (!customerId) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setBusy(true);
      try {
        const payload = next.map((it, i) => (resetIdx.includes(i) ? { ...it, unit_price: 0 } : it));
        const r = await fetch("/api/quotes/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customer_id: customerId, exclude_quote_id: excludeQuoteId, items: payload }) });
        if (!r.ok) return;
        const { items: priced } = (await r.json()) as { items: DraftItem[] };
        // 照合中にユーザーが入力した値（品名・備考・単価）は壊さない
        onChange(latest.current.map((cur, i) => {
          const p = priced[i];
          if (!p || p.product_id !== cur.product_id) return cur;
          const keepPrice = !resetIdx.includes(i) && cur.unit_price > 0;
          return { ...p, description: cur.description, remarks: cur.remarks, unit: cur.unit || p.unit, unit_price: keepPrice ? cur.unit_price : p.unit_price };
        }));
      } finally { setBusy(false); }
    }, 250);
  }, [customerId, excludeQuoteId, onChange]);

  // 得意先が変わったら全明細を提案価格で引き直す
  const prevCustomer = useRef(customerId);
  useEffect(() => {
    if (prevCustomer.current !== customerId) {
      prevCustomer.current = customerId;
      if (customerId) reprice(latest.current, latest.current.map((_, i) => i));
    }
  }, [customerId, reprice]);

  const update = (i: number, patch: Partial<DraftItem>, reset = false) => {
    const next = items.map((it, k) => (k === i ? { ...it, ...patch } : it));
    reprice(next, reset ? [i] : []);
  };
  const pickProduct = (i: number, p: ProductLite | null) => {
    update(i, p ? { product_id: p.id, product: { ...p, list_price: 0, maker: "", spec: "" }, description: `${p.name}（${p.part_number}）`, unit: p.unit, unit_price: 0, supplier_id: null } : { product_id: null, product: null, proposal: null, checks: [], supplier_options: [], supplier_id: null }, true);
  };
  const total = items.reduce((s, it) => s + it.qty * it.unit_price, 0);
  const cost = items.reduce((s, it) => s + it.qty * it.cost, 0);
  const margin = total ? ((total - cost) / total) * 100 : 0;

  return (
    <div>
      <div className="overflow-x-auto -mx-3 px-3 lg:mx-0 lg:px-0">
      <table className="w-full text-sm min-w-[56rem]">
        <thead className="text-xs text-muted">
          <tr><th className="text-left font-normal py-1 w-8">#</th><th className="text-left font-normal w-[26%]">商品</th><th className="text-right font-normal w-20">数量</th><th className="text-left font-normal w-12 pl-2">単位</th><th className="text-right font-normal w-28">単価</th><th className="text-left font-normal pl-3 w-[20%]">仕入れ（原価）</th><th className="text-right font-normal w-16">粗利</th><th className="text-right font-normal w-24">金額</th><th className="text-left font-normal pl-3">チェック</th><th className="w-8" /></tr>
        </thead>
        <tbody>
          {items.map((it, i) => {
            const lvl = worst(it.checks);
            const m = it.unit_price ? ((it.unit_price - it.cost) / it.unit_price) * 100 : 0;
            return (
              <FragmentRow key={i}>
                <tr className={`border-t border-line align-top ${lvl === "danger" ? "bg-red-50/40" : lvl === "warn" ? "bg-amber-50/40" : ""}`}>
                  <td className="py-2 text-muted num">{i + 1}</td>
                  <td className="py-2">
                    <ProductPicker value={it.product} candidates={it.candidates} onPick={(p) => pickProduct(i, p)} />
                    {!it.product && <input className={`${inputCls} mt-1`} placeholder="品名（自由入力）" value={it.description} onChange={(e) => update(i, { description: e.target.value })} />}
                    {it.raw_text && <div className="text-[11px] text-muted mt-1 truncate" title={it.raw_text}>依頼文: {it.raw_text}</div>}
                    {it.is_new_for_customer && <span className="text-[11px] text-info">初回購入</span>}
                  </td>
                  <td className="py-2"><input type="number" min={0} className={`${inputCls} text-right num`} value={it.qty} onChange={(e) => update(i, { qty: Number(e.target.value) })} /></td>
                  <td className="py-2 pl-2"><input className={`${inputCls} num`} value={it.unit} onChange={(e) => update(i, { unit: e.target.value })} /></td>
                  <td className="py-2">
                    <input type="number" min={0} step={10} className={`${inputCls} text-right num ${lvl === "danger" ? "border-danger" : lvl === "warn" ? "border-warn" : ""}`} value={it.unit_price} onChange={(e) => update(i, { unit_price: Number(e.target.value) })} />
                    {it.proposal && it.proposal.proposed_price !== it.unit_price && (
                      <button type="button" className="text-[11px] text-brand hover:underline mt-0.5 num" onClick={() => update(i, { unit_price: it.proposal!.proposed_price })}>提案 {yen(it.proposal.proposed_price)} に戻す</button>
                    )}
                  </td>
                  <td className="py-2 pl-3">
                    {it.supplier_options.length ? (
                      <select className={inputCls} value={it.supplier_id ?? ""} onChange={(e) => update(i, { supplier_id: Number(e.target.value), cost: it.supplier_options.find((o) => o.supplier_id === Number(e.target.value))?.cost ?? it.cost })}>
                        {it.supplier_options.map((o) => <option key={o.supplier_id} value={o.supplier_id}>{o.supplier_name.replace(/株式会社/g, "")}（{ROUTE_LABEL[o.route_type]}）{yen(o.cost)}</option>)}
                      </select>
                    ) : (
                      <input type="number" className={`${inputCls} text-right num`} placeholder="原価" value={it.cost} onChange={(e) => update(i, { cost: Number(e.target.value) })} />
                    )}
                  </td>
                  <td className={`py-2 text-right num ${m < 0 ? "text-danger font-bold" : m < 15 ? "text-warn" : ""}`}>{it.unit_price ? pct(m, 0) : "-"}</td>
                  <td className="py-2 text-right num">{yen(it.qty * it.unit_price)}</td>
                  <td className="py-2 pl-3">
                    <div className="flex flex-wrap gap-1">
                      {it.checks.length === 0 && it.product && <LevelBadge level="ok">OK</LevelBadge>}
                      {it.checks.map((c) => <LevelBadge key={c.code} level={c.level}>{c.title}</LevelBadge>)}
                    </div>
                    {it.product && <button type="button" className="text-[11px] text-brand hover:underline mt-1" onClick={() => setOpen(open === i ? null : i)}>{open === i ? "根拠を閉じる" : "根拠・履歴を見る"}</button>}
                  </td>
                  <td className="py-2 text-right"><button type="button" className="text-muted hover:text-danger" title="削除" onClick={() => reprice(items.filter((_, k) => k !== i))}>×</button></td>
                </tr>
                {open === i && it.proposal && (
                  <tr className="bg-bg/60"><td /><td colSpan={9} className="px-2 py-3"><ProposalDetail item={it} onInquiry={onInquiry} /></td></tr>
                )}
              </FragmentRow>
            );
          })}
        </tbody>
      </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
        <Button size="sm" onClick={() => reprice([...items, emptyItem()])}>＋ 明細を追加</Button>
        <div className="flex items-center gap-6 text-sm">
          {busy && <span className="text-xs text-muted">価格を照合中…</span>}
          <span className="text-muted">原価 <span className="num">{yen(cost)}</span></span>
          <span className={`${margin < 15 ? "text-warn" : "text-ok"}`}>粗利率 <span className="num font-semibold">{pct(margin)}</span></span>
          <span className="font-bold text-base">合計（税抜） <span className="num">{yen(total)}</span></span>
        </div>
      </div>
    </div>
  );
}

function FragmentRow({ children }: { children: React.ReactNode }) { return <>{children}</>; }

export function ProposalDetail({ item, onInquiry }: { item: DraftItem; onInquiry?: (item: DraftItem) => void }) {
  const p = item.proposal!;
  return (
    <div className="grid md:grid-cols-3 gap-4 text-xs">
      <div>
        <div className="font-semibold mb-1">提案単価の根拠</div>
        <p className="text-muted">{p.proposal_basis}</p>
        <ul className="mt-2 space-y-0.5">
          <li>提案単価: <b className="num">{yen(p.proposed_price)}</b></li>
          <li>値引き下限（粗利下限を守る価格）: <b className="num text-warn">{yen(p.floor_price)}</b></li>
          <li>推奨粗利での価格: <span className="num">{yen(p.target_price)}</span></li>
          <li>最安仕入れ: <span className="num">{yen(p.best_cost)}</span>（{p.best_supplier_name ?? "-"}）</li>
        </ul>
        {item.checks.map((c) => <p key={c.code} className="mt-2 text-ink"><b>{c.title}</b>：{c.detail}</p>)}
        {onInquiry && <button type="button" className="mt-2 text-brand hover:underline" onClick={() => onInquiry(item)}>仕入れ先へ納期・価格を問い合わせる（下書き作成）</button>}
      </div>
      <div>
        <div className="font-semibold mb-1">仕入れルート比較</div>
        <table className="w-full"><tbody>
          {item.supplier_options.map((o, i) => (
            <tr key={o.supplier_id} className={i === 0 ? "font-semibold" : "text-muted"}><td>{o.supplier_name.replace(/株式会社/g, "")}</td><td>{ROUTE_LABEL[o.route_type]}</td><td className="text-right num">{yen(o.cost)}</td><td className="text-right num">{o.min_lot}〜</td><td className="text-right num">{o.lead_time_days ?? "-"}日</td></tr>
          ))}
        </tbody></table>
        {p.other_customers && <p className="mt-2 text-muted">他の得意先への売価: {yen(p.other_customers.min)}〜{yen(p.other_customers.max)}（平均 {yen(p.other_customers.avg)}、{p.other_customers.count}件）</p>}
      </div>
      <div>
        <div className="font-semibold mb-1">販売履歴（直近）</div>
        {p.history.length === 0 ? <p className="text-muted">履歴なし</p> : (
          <table className="w-full"><tbody>
            {p.history.map((h) => (
              <tr key={h.quote_id} className={h.customer_id === p.last_same_customer?.customer_id ? "" : "text-muted"}>
                <td className="num">{dateJp(h.date)}</td><td>{h.customer_name}</td><td className="num text-right">{h.qty}</td><td className="num text-right">{yen(h.unit_price)}</td><td className="text-right">{{ won: "受注", lost: "失注", submitted: "提出", tracking: "追跡", draft: "" }[h.status]}</td>
              </tr>
            ))}
          </tbody></table>
        )}
      </div>
    </div>
  );
}
