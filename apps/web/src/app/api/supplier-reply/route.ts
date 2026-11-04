import { extractSupplierReply, extractSupplierReplyFallback, hasApiKey } from "@eigyo/core";
import { todayIso } from "@/lib/format";
import { fail, ok } from "../_util";

export const dynamic = "force-dynamic";

/** 仕入れ先の回答メール本文から単価・納期・有効期限・最小ロットを抜き出す（AI、無ければ簡易抽出）。 */
export async function POST(req: Request) {
  try {
    const b = (await req.json()) as { text?: string; context?: string };
    if (!b.text?.trim()) return fail(new Error("回答メールの本文を貼り付けてください"), 400);
    const today = todayIso();
    if (hasApiKey()) return ok({ ...(await extractSupplierReply(b.text, today, b.context)), ai_used: true });
    return ok({ ...extractSupplierReplyFallback(b.text, today), ai_used: false });
  } catch (e) { return fail(e); }
}
