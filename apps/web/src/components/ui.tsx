import Link from "next/link";
import type { CheckLevel, QuoteStatus } from "@eigyo/core/shared";
import { STATUS_LABEL } from "@eigyo/core/shared";

export function Card({ title, action, children, className = "" }: { title?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`bg-surface border border-line rounded-lg min-w-0 overflow-hidden ${className}`}>
      {(title || action) && (
        <header className="flex items-center justify-between px-4 py-3 border-b border-line">
          <h2 className="font-semibold text-sm">{title}</h2>
          {action}
        </header>
      )}
      <div className="p-3 lg:p-4">{children}</div>
    </section>
  );
}

export function PageTitle({ title, sub, action }: { title: string; sub?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between mb-4 lg:mb-5 gap-2 lg:gap-4">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold">{title}</h1>
        {sub && <p className="text-sm text-muted mt-1">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md"; busy?: boolean };
export function Button({ variant = "secondary", size = "md", busy, className = "", children, disabled, ...rest }: BtnProps) {
  const base = "inline-flex items-center gap-1.5 rounded-md font-medium transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap";
  const v = {
    primary: "bg-brand text-brand-ink hover:opacity-90",
    secondary: "bg-surface border border-line hover:bg-bg",
    ghost: "hover:bg-bg text-muted",
    danger: "bg-danger text-white hover:opacity-90",
  }[variant];
  const s = size === "sm" ? "text-xs px-2.5 py-1" : "text-sm px-3.5 py-2";
  return (
    <button className={`${base} ${v} ${s} ${className}`} disabled={disabled || busy} {...rest}>
      {busy && <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />}
      {children}
    </button>
  );
}

export function LinkButton({ href, children, variant = "secondary", className = "" }: { href: string; children: React.ReactNode; variant?: "primary" | "secondary"; className?: string }) {
  const v = variant === "primary" ? "bg-brand text-brand-ink hover:opacity-90" : "bg-surface border border-line hover:bg-bg";
  return <Link href={href} className={`inline-flex items-center gap-1.5 rounded-md text-sm px-3.5 py-2 font-medium transition ${v} ${className}`}>{children}</Link>;
}

export function StatusBadge({ status }: { status: QuoteStatus }) {
  const c = {
    draft: "bg-gray-100 text-gray-700",
    submitted: "bg-blue-50 text-blue-700",
    tracking: "bg-amber-50 text-amber-700",
    won: "bg-green-50 text-green-700",
    lost: "bg-red-50 text-red-700",
  }[status];
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${c}`}>{STATUS_LABEL[status]}</span>;
}

export function LevelBadge({ level, children }: { level: CheckLevel; children: React.ReactNode }) {
  const c = {
    ok: "bg-green-50 text-green-700 border-green-200",
    info: "bg-blue-50 text-blue-700 border-blue-200",
    warn: "bg-amber-50 text-amber-800 border-amber-200",
    danger: "bg-red-50 text-red-700 border-red-200",
  }[level];
  return <span className={`inline-block rounded border px-1.5 py-0.5 text-[11px] font-semibold ${c}`}>{children}</span>;
}

export function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "brand" | "ok" | "warn" | "danger" }) {
  const t = { brand: "text-brand", ok: "text-ok", warn: "text-warn", danger: "text-danger" }[tone ?? "brand"];
  return (
    <div className="bg-surface border border-line rounded-lg px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={`text-2xl font-bold num ${t}`}>{value}</div>
      {sub && <div className="text-xs text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-sm text-muted text-center py-8">{children}</div>;
}

export const inputCls = "w-full rounded-md border border-line px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand";
export const labelCls = "block text-xs text-muted mb-1";
