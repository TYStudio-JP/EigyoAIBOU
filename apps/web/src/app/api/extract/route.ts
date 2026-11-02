import { excelToText, extractQuoteRequest, extractQuoteRequestFallback, hasApiKey, listCustomers } from "@eigyo/core";
import { db } from "@/lib/db";
import { buildDraft } from "@/lib/draft";
import { todayIso } from "@/lib/format";
import { fail, ok } from "../_util";

export const dynamic = "force-dynamic";

/** メール本文・メモ・添付（xlsx/pdf/画像）から見積り下書きを作る。multipart/form-data または JSON。 */
export async function POST(req: Request) {
  try {
    const d = db();
    let text = "";
    let sourceType = "memo";
    let file: { name: string; media_type: string; base64: string } | undefined;
    let customerId: number | null = null;
    const ct = req.headers.get("content-type") ?? "";
    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      text = String(form.get("text") ?? "");
      sourceType = String(form.get("source_type") ?? "memo");
      customerId = form.get("customer_id") ? Number(form.get("customer_id")) : null;
      const f = form.get("file");
      if (f instanceof File && f.size > 0) {
        const buf = Buffer.from(await f.arrayBuffer());
        const name = f.name.toLowerCase();
        if (name.endsWith(".xlsx") || name.endsWith(".xlsm")) {
          text += `\n\n--- 添付 Excel (${f.name}) ---\n${await excelToText(buf)}`;
          sourceType = "file";
        } else if (name.endsWith(".csv") || name.endsWith(".txt")) {
          text += `\n\n--- 添付 (${f.name}) ---\n${buf.toString("utf8")}`;
          sourceType = "file";
        } else if (name.endsWith(".pdf") || f.type.startsWith("image/")) {
          file = { name: f.name, media_type: name.endsWith(".pdf") ? "application/pdf" : f.type, base64: buf.toString("base64") };
          sourceType = "file";
        } else {
          return fail(new Error("対応していないファイル形式です（xlsx / pdf / 画像 / csv / txt）"), 400);
        }
      }
    } else {
      const body = (await req.json()) as { text?: string; source_type?: string; customer_id?: number | null };
      text = body.text ?? "";
      sourceType = body.source_type ?? "memo";
      customerId = body.customer_id ?? null;
    }
    if (!text.trim() && !file) return fail(new Error("依頼文または添付ファイルを指定してください"), 400);

    const today = todayIso();
    const names = listCustomers(d).map((c) => `${c.short_name}（${c.name}／担当 ${c.contact_name ?? "-"}）`);
    let ex;
    let aiUsed = false;
    if (hasApiKey()) {
      ex = await extractQuoteRequest({ text: text || undefined, file, today, customerNames: names });
      aiUsed = true;
    } else {
      ex = extractQuoteRequestFallback(text, today);
    }
    const draft = buildDraft(d, ex, { source_type: sourceType, source_text: text || `[添付] ${file?.name ?? ""}`, ai_used: aiUsed, customer_id: customerId });
    return ok(draft);
  } catch (e) {
    return fail(e);
  }
}
