import { readFileSync } from "node:fs";
import { hasQuoteTemplate, quoteTemplatePath, removeQuoteTemplate, sampleQuoteTemplate, saveQuoteTemplate, QUOTE_TEMPLATE_KEYS } from "@eigyo/core";
import { fail, ok } from "../../_util";

export const dynamic = "force-dynamic";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const download = (buf: Buffer, name: string) => new Response(new Uint8Array(buf), { headers: { "Content-Type": XLSX, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}` } });

/** GET ?sample=1 → 差し込みキー入りのサンプル。GET ?download=1 → 登録済みテンプレート。GET → 状態。 */
export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    if (u.searchParams.get("sample") === "1") return download(await sampleQuoteTemplate(), "見積書テンプレート_サンプル.xlsx");
    if (u.searchParams.get("download") === "1") { if (!hasQuoteTemplate()) return fail(new Error("テンプレートは未登録です"), 404); return download(readFileSync(quoteTemplatePath()), "quote_template.xlsx"); }
    return ok({ registered: hasQuoteTemplate(), path: quoteTemplatePath(), keys: QUOTE_TEMPLATE_KEYS });
  } catch (e) { return fail(e); }
}

/** 自社書式のテンプレート（xlsx）を登録する。 */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const f = form.get("file");
    if (!(f instanceof File) || f.size === 0) return fail(new Error("xlsx ファイルを選んでください"), 400);
    if (!f.name.toLowerCase().endsWith(".xlsx")) return fail(new Error("xlsx 形式のみ登録できます"), 400);
    if (f.size > 5 * 1024 * 1024) return fail(new Error("ファイルが大きすぎます（5MB まで）"), 400);
    const buf = Buffer.from(await f.arrayBuffer());
    // 差し込みキーが 1 つも無いテンプレートは誤登録の可能性が高い
    const text = buf.toString("latin1");
    if (!/\{\{/.test(text) && !/&#123;&#123;|\{\{/.test(buf.toString("utf8"))) {
      // xlsx は zip なので本文は圧縮されている。exceljs で読んで判定する
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf as unknown as ArrayBuffer);
      let found = false;
      wb.worksheets[0]?.eachRow((row) => row.eachCell((c) => { if (typeof c.value === "string" && /\{\{\s*[\w.]+\s*\}\}/.test(c.value)) found = true; }));
      if (!found) return fail(new Error("差し込みキー（{{quote_no}} など）が見つかりません。サンプルを元に作ってください"), 400);
    }
    saveQuoteTemplate(buf);
    return ok({ registered: true });
  } catch (e) { return fail(e); }
}

export async function DELETE() {
  try { removeQuoteTemplate(); return ok({ registered: false }); } catch (e) { return fail(e); }
}
