"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "ダッシュボード", icon: "▦" },
  { href: "/quotes/new", label: "見積りを作る", icon: "✎" },
  { href: "/quotes", label: "見積り一覧", icon: "☰" },
  { href: "/tracking", label: "追跡ボード", icon: "◔" },
  { href: "/customers", label: "得意先・横展開", icon: "⌂" },
  { href: "/products", label: "商品・仕入れ", icon: "▤" },
  { href: "/settings", label: "設定", icon: "⚙" },
];

export function Nav() {
  const path = usePathname();
  return (
    <aside className="no-print w-56 shrink-0 border-r border-line bg-surface flex flex-col">
      <div className="px-5 py-5 border-b border-line">
        <div className="text-xs text-muted tracking-widest">EIGYO AIBOU</div>
        <div className="text-xl font-bold text-brand">営業AI棒</div>
        <div className="text-[11px] text-muted mt-1">商談・訪問・電話以外は、こちらで。</div>
      </div>
      <nav className="flex-1 p-3 space-y-0.5">
        {items.map((it) => {
          const active = it.href === "/" ? path === "/" : path.startsWith(it.href) && !(it.href === "/quotes" && path.startsWith("/quotes/new"));
          return (
            <Link key={it.href} href={it.href}
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition ${active ? "bg-brand text-brand-ink font-semibold" : "text-ink hover:bg-bg"}`}>
              <span className="w-4 text-center opacity-70">{it.icon}</span>{it.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-4 text-[11px] text-muted border-t border-line">Built with Claude Japan 2026</div>
    </aside>
  );
}
