"use client";
import { useEffect } from "react";

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className={`bg-surface rounded-lg shadow-xl w-full ${wide ? "max-w-4xl" : "max-w-2xl"} max-h-[90vh] flex flex-col`} onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between px-5 py-3 border-b border-line">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="text-muted hover:text-ink text-xl leading-none">×</button>
        </header>
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function CopyButton({ text, label = "コピー" }: { text: string; label?: string }) {
  return (
    <button
      type="button"
      className="text-xs rounded border border-line px-2 py-1 hover:bg-bg"
      onClick={async () => { try { await navigator.clipboard.writeText(text); } catch { /* ignore */ } }}
    >
      {label}
    </button>
  );
}
