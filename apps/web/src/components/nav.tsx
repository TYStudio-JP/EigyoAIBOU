"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const desktop = [
  { href: "/", label: "ダッシュボード", icon: "▦" },
  { href: "/calls", label: "電話メモ", icon: "☎" },
  { href: "/deals", label: "案件", icon: "◆" },
  { href: "/quotes/new", label: "見積りを作る", icon: "✎" },
  { href: "/quotes", label: "見積り一覧", icon: "☰" },
  { href: "/tracking", label: "追跡ボード", icon: "◔" },
  { href: "/customers", label: "得意先・横展開", icon: "⌂" },
  { href: "/products", label: "商品・仕入れ", icon: "▤" },
  { href: "/settings", label: "設定", icon: "⚙" },
];
const mobile = [
  { href: "/", label: "今日", icon: "▦" },
  { href: "/calls", label: "電話", icon: "☎" },
  { href: "/deals", label: "案件", icon: "◆" },
  { href: "/quotes", label: "見積り", icon: "☰" },
  { href: "/customers", label: "得意先", icon: "⌂" },
];

function isActive(path: string, href: string) {
  if (href === "/") return path === "/";
  if (href === "/quotes") return path.startsWith("/quotes") && !path.startsWith("/quotes/new");
  return path.startsWith(href);
}

export function Nav() {
  const path = usePathname();
  if (path === "/unlock") return null;
  return (
    <>
      {/* デスクトップ：サイドバー */}
      <aside className="no-print hidden lg:flex w-56 shrink-0 border-r border-line bg-surface flex-col">
        <div className="px-5 py-5 border-b border-line">
          <div className="text-xs text-muted tracking-widest">EIGYO AIBOU</div>
          <div className="text-xl font-bold text-brand">営業AI棒</div>
          <div className="text-[11px] text-muted mt-1">商談・訪問・電話以外は、こちらで。</div>
        </div>
        <nav className="flex-1 p-3 space-y-0.5">
          {desktop.map((it) => (
            <Link key={it.href} href={it.href} className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition ${isActive(path, it.href) ? "bg-brand text-brand-ink font-semibold" : "text-ink hover:bg-bg"}`}>
              <span className="w-4 text-center opacity-70">{it.icon}</span>{it.label}
            </Link>
          ))}
        </nav>
        <div className="p-4 text-[11px] text-muted border-t border-line">Built with Claude Japan 2026</div>
      </aside>

      {/* スマホ：上部バー */}
      <header className="no-print lg:hidden sticky top-0 z-30 bg-surface/95 backdrop-blur border-b border-line px-4 h-12 flex items-center justify-between" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <Link href="/" className="font-bold text-brand text-lg">営業AI棒</Link>
        <div className="flex items-center gap-3 text-sm">
          <Link href="/calls/new" className="rounded-full bg-brand text-brand-ink px-3 py-1 text-xs font-semibold">☎ 電話メモ</Link>
          <Link href="/quotes/new" className="rounded-full border border-line px-3 py-1 text-xs font-semibold">✎ 見積り</Link>
        </div>
      </header>

      {/* スマホ：下タブ */}
      <nav className="no-print lg:hidden fixed bottom-0 inset-x-0 z-30 bg-surface border-t border-line grid grid-cols-5" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {mobile.map((it) => (
          <Link key={it.href} href={it.href} className={`flex flex-col items-center justify-center py-2 text-[11px] ${isActive(path, it.href) ? "text-brand font-bold" : "text-muted"}`}>
            <span className="text-lg leading-none mb-0.5">{it.icon}</span>{it.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
