"use client";
import { useState } from "react";
import { Modal } from "./modal";
import { WebResearch } from "./web-research";

export function ProductResearchButton({ product, aiEnabled }: { product: { maker: string; part_number: string; name: string; spec: string }; aiEnabled: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-brand hover:underline whitespace-nowrap">🌐 調べる</button>
      {open && <Modal title={`${product.name}（${product.part_number}）`} onClose={() => setOpen(false)}><WebResearch product={product} aiEnabled={aiEnabled} /></Modal>}
    </>
  );
}
