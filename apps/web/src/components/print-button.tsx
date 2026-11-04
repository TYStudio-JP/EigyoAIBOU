"use client";
export function PrintButton() {
  return <button type="button" className="rounded-md bg-brand text-brand-ink px-3 py-1.5 text-xs font-semibold whitespace-nowrap" onClick={() => window.print()}>印刷 / PDF に保存</button>;
}
