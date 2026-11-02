"use client";
import { useEffect, useRef, useState } from "react";
import { inputCls } from "./ui";

export interface ProductLite { id: number; code: string; name: string; part_number: string; unit: string }

export function ProductPicker({ value, candidates, onPick, placeholder = "品番・商品名で検索" }: { value: ProductLite | null; candidates?: ProductLite[]; onPick: (p: ProductLite | null) => void; placeholder?: string }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<ProductLite[]>(candidates ?? []);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!open) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      if (!q.trim()) { setResults(candidates ?? []); return; }
      const r = await fetch(`/api/products/search?q=${encodeURIComponent(q)}`);
      setResults(await r.json());
    }, 200);
  }, [q, open, candidates]);
  return (
    <div className="relative">
      {value && !open ? (
        <button type="button" className="text-left w-full" onClick={() => setOpen(true)}>
          <div className="font-medium leading-tight">{value.name}</div>
          <div className="text-xs text-muted num">{value.code} / {value.part_number}</div>
        </button>
      ) : (
        <input autoFocus={open} className={inputCls} placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
      )}
      {open && (
        <ul className="absolute z-20 mt-1 w-[28rem] max-w-[80vw] bg-surface border border-line rounded-md shadow-lg max-h-64 overflow-auto">
          {results.length === 0 && <li className="px-3 py-2 text-xs text-muted">該当なし。別の語で検索してください</li>}
          {results.map((p) => (
            <li key={p.id}>
              <button type="button" className="w-full text-left px-3 py-1.5 hover:bg-bg text-sm" onMouseDown={() => { onPick(p); setOpen(false); setQ(""); }}>
                <span className="font-medium">{p.name}</span> <span className="text-xs text-muted num">{p.code} / {p.part_number}</span>
              </button>
            </li>
          ))}
          <li className="border-t border-line"><button type="button" className="w-full text-left px-3 py-1.5 text-xs text-muted hover:bg-bg" onMouseDown={() => { onPick(null); setOpen(false); }}>未登録品として自由入力にする</button></li>
        </ul>
      )}
    </div>
  );
}
