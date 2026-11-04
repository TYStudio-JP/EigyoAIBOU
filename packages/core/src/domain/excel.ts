import ExcelJS from "exceljs";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { QuoteWithItems, Settings } from "./types";
import { findRepoRoot } from "../db/connection";

/** 自社書式テンプレートの置き場（data/templates/quote_template.xlsx）。あればこれを使い、無ければ既定書式。 */
export function quoteTemplatePath(): string { return process.env.EIGYO_QUOTE_TEMPLATE ?? join(findRepoRoot(), "data", "templates", "quote_template.xlsx"); }
export function hasQuoteTemplate(): boolean { return existsSync(quoteTemplatePath()); }
export function saveQuoteTemplate(buf: Buffer): void { const p = quoteTemplatePath(); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, buf); }
export function removeQuoteTemplate(): void { const p = quoteTemplatePath(); if (existsSync(p)) unlinkSync(p); }

/** テンプレートで使える差し込みキー。セルに {{キー}} と書く。明細行は {{item.xxx}} を含む行が 1 行あれば明細数だけ複製される。 */
export const QUOTE_TEMPLATE_KEYS = [
  "customer.name", "customer.contact_name", "customer.payment_terms", "quote_no", "date", "valid_until", "subject", "delivery",
  "company.name", "company.address", "company.tel", "company.rep", "subtotal", "tax", "total", "notes",
  "item.no", "item.description", "item.spec", "item.qty", "item.unit", "item.unit_price", "item.amount", "item.remarks",
] as const;

function templateValues(q: QuoteWithItems, settings: Settings): Record<string, string | number> {
  const tax = Math.round(q.total * settings.tax_rate);
  return {
    "customer.name": q.customer.name, "customer.contact_name": q.customer.contact_name ?? "", "customer.payment_terms": q.customer.payment_terms,
    quote_no: q.quote_no, date: (q.submitted_at ?? q.created_at).slice(0, 10), valid_until: q.valid_until ?? "", subject: q.subject,
    delivery: q.promised_delivery ?? q.requested_delivery ?? "別途ご相談",
    "company.name": settings.company_name, "company.address": settings.company_address, "company.tel": settings.company_tel, "company.rep": settings.sales_rep,
    subtotal: Math.round(q.total), tax, total: Math.round(q.total) + tax, notes: q.notes,
  };
}
const PH = /\{\{\s*([\w.]+)\s*\}\}/g;
function fillCell(raw: unknown, values: Record<string, string | number>): unknown {
  if (typeof raw !== "string") return raw;
  const only = raw.match(/^\{\{\s*([\w.]+)\s*\}\}$/);
  if (only) return only[1] in values ? values[only[1]] : "";
  if (!/\{\{/.test(raw)) return raw;
  return raw.replace(PH, (_, k: string) => (k in values ? String(values[k]) : ""));
}

/** 自社書式テンプレートに差し込む。 */
export async function fillQuoteTemplate(template: Buffer, q: QuoteWithItems, settings: Settings): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(template as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("テンプレートにシートがありません");
  const base = templateValues(q, settings);
  // 明細行（{{item.*}} を含む最初の行）を見つけて明細数だけ複製
  let itemRow = 0;
  ws.eachRow((row, n) => { if (!itemRow && (row.values as unknown[]).some((v) => typeof v === "string" && /\{\{\s*item\./.test(v))) itemRow = n; });
  if (itemRow) {
    const n = Math.max(1, q.items.length);
    if (n > 1) ws.duplicateRow(itemRow, n - 1, true);
    for (let i = 0; i < n; i++) {
      const it = q.items[i];
      const vals: Record<string, string | number> = it
        ? { ...base, "item.no": it.line_no, "item.description": it.description, "item.spec": it.product?.spec ?? "", "item.qty": it.qty, "item.unit": it.unit, "item.unit_price": it.unit_price, "item.amount": it.qty * it.unit_price, "item.remarks": it.remarks }
        : { ...base, "item.no": "", "item.description": "", "item.spec": "", "item.qty": "", "item.unit": "", "item.unit_price": "", "item.amount": "", "item.remarks": "" };
      ws.getRow(itemRow + i).eachCell({ includeEmpty: true }, (cell) => { cell.value = fillCell(cell.value, vals) as ExcelJS.CellValue; });
    }
  }
  ws.eachRow((row) => row.eachCell({ includeEmpty: false }, (cell) => { cell.value = fillCell(cell.value, base) as ExcelJS.CellValue; }));
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}

/** 見積書を Excel で出力する。自社書式テンプレートがあればそれに差し込み、無ければ一般的な商社書式。 */
export async function quoteToExcel(q: QuoteWithItems, settings: Settings): Promise<Buffer> {
  if (hasQuoteTemplate()) return fillQuoteTemplate(readFileSync(quoteTemplatePath()), q, settings);
  return quoteToExcelDefault(q, settings);
}

/** 既定書式（テンプレート無し）。 */
export async function quoteToExcelDefault(q: QuoteWithItems, settings: Settings): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = settings.company_name;
  const ws = wb.addWorksheet("見積書", { pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true } });
  ws.columns = [{ width: 6 }, { width: 36 }, { width: 10 }, { width: 8 }, { width: 14 }, { width: 16 }, { width: 24 }];

  ws.mergeCells("A1:G1");
  ws.getCell("A1").value = "御 見 積 書";
  ws.getCell("A1").font = { size: 20, bold: true };
  ws.getCell("A1").alignment = { horizontal: "center" };

  ws.getCell("A3").value = `${q.customer.name} 御中`;
  ws.getCell("A3").font = { size: 14, bold: true };
  ws.getCell("A4").value = q.customer.contact_name ? `${q.customer.contact_name} 様` : "";
  ws.getCell("E3").value = "見積番号"; ws.getCell("F3").value = q.quote_no;
  ws.getCell("E4").value = "見積日"; ws.getCell("F4").value = (q.submitted_at ?? q.created_at).slice(0, 10);
  ws.getCell("E5").value = "有効期限"; ws.getCell("F5").value = q.valid_until ?? "";

  ws.getCell("A6").value = "件名"; ws.getCell("B6").value = q.subject;
  ws.getCell("A7").value = "納期"; ws.getCell("B7").value = q.promised_delivery ?? q.requested_delivery ?? "別途ご相談";
  ws.getCell("A8").value = "支払条件"; ws.getCell("B8").value = q.customer.payment_terms;

  ws.getCell("E7").value = settings.company_name; ws.getCell("E7").font = { bold: true, size: 12 };
  ws.getCell("E8").value = settings.company_address;
  ws.getCell("E9").value = `TEL ${settings.company_tel}`;
  ws.getCell("E10").value = `担当: ${settings.sales_rep}`;

  const tax = Math.round(q.total * settings.tax_rate);
  ws.getCell("A12").value = "御見積金額（税込）";
  ws.getCell("A12").font = { bold: true };
  ws.mergeCells("B12:C12");
  ws.getCell("B12").value = Math.round(q.total) + tax;
  ws.getCell("B12").numFmt = "¥#,##0";
  ws.getCell("B12").font = { bold: true, size: 14 };
  ws.getCell("B12").border = { bottom: { style: "double" } };

  const headerRow = 14;
  const headers = ["No.", "品名・仕様", "数量", "単位", "単価", "金額", "備考"];
  headers.forEach((h, i) => {
    const c = ws.getCell(headerRow, i + 1);
    c.value = h; c.font = { bold: true }; c.alignment = { horizontal: "center" };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEF5" } };
    c.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
  });
  q.items.forEach((it, i) => {
    const r = headerRow + 1 + i;
    const vals: (string | number)[] = [it.line_no, it.description + (it.product?.spec ? `　${it.product.spec}` : ""), it.qty, it.unit, it.unit_price, it.qty * it.unit_price, it.remarks];
    vals.forEach((v, j) => {
      const c = ws.getCell(r, j + 1);
      c.value = v;
      c.border = { top: { style: "hair" }, bottom: { style: "hair" }, left: { style: "thin" }, right: { style: "thin" } };
      if (j === 4 || j === 5) c.numFmt = "#,##0";
      if (j === 0 || j === 2 || j === 3) c.alignment = { horizontal: "center" };
    });
  });
  let r = headerRow + 1 + q.items.length;
  const put = (label: string, v: number, bold = false) => {
    ws.getCell(r, 5).value = label; ws.getCell(r, 5).alignment = { horizontal: "right" };
    ws.getCell(r, 6).value = v; ws.getCell(r, 6).numFmt = "#,##0";
    if (bold) { ws.getCell(r, 5).font = { bold: true }; ws.getCell(r, 6).font = { bold: true }; }
    r++;
  };
  put("小計", Math.round(q.total));
  put(`消費税（${Math.round(settings.tax_rate * 100)}%）`, tax);
  put("合計", Math.round(q.total) + tax, true);
  r++;
  ws.getCell(r, 1).value = "備考";
  ws.mergeCells(r, 2, r + 2, 7);
  ws.getCell(r, 2).value = q.notes;
  ws.getCell(r, 2).alignment = { wrapText: true, vertical: "top" };

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}

/** 既定書式と同じレイアウトで、値の代わりに差し込みキーを入れたサンプルテンプレートを作る（自社書式を作る土台）。 */
export async function sampleQuoteTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("見積書", { pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true } });
  ws.columns = [{ width: 6 }, { width: 36 }, { width: 10 }, { width: 8 }, { width: 14 }, { width: 16 }, { width: 24 }];
  ws.mergeCells("A1:G1"); ws.getCell("A1").value = "御 見 積 書"; ws.getCell("A1").font = { size: 20, bold: true }; ws.getCell("A1").alignment = { horizontal: "center" };
  ws.getCell("A3").value = "{{customer.name}} 御中"; ws.getCell("A3").font = { size: 14, bold: true };
  ws.getCell("A4").value = "{{customer.contact_name}} 様";
  ws.getCell("E3").value = "見積番号"; ws.getCell("F3").value = "{{quote_no}}";
  ws.getCell("E4").value = "見積日"; ws.getCell("F4").value = "{{date}}";
  ws.getCell("E5").value = "有効期限"; ws.getCell("F5").value = "{{valid_until}}";
  ws.getCell("A6").value = "件名"; ws.getCell("B6").value = "{{subject}}";
  ws.getCell("A7").value = "納期"; ws.getCell("B7").value = "{{delivery}}";
  ws.getCell("A8").value = "支払条件"; ws.getCell("B8").value = "{{customer.payment_terms}}";
  ws.getCell("E7").value = "{{company.name}}"; ws.getCell("E7").font = { bold: true, size: 12 };
  ws.getCell("E8").value = "{{company.address}}"; ws.getCell("E9").value = "TEL {{company.tel}}"; ws.getCell("E10").value = "担当: {{company.rep}}";
  ws.getCell("A12").value = "御見積金額（税込）"; ws.getCell("A12").font = { bold: true };
  ws.mergeCells("B12:C12"); ws.getCell("B12").value = "{{total}}"; ws.getCell("B12").numFmt = "¥#,##0"; ws.getCell("B12").font = { bold: true, size: 14 }; ws.getCell("B12").border = { bottom: { style: "double" } };
  const headers = ["No.", "品名・仕様", "数量", "単位", "単価", "金額", "備考"];
  headers.forEach((h, i) => { const c = ws.getCell(14, i + 1); c.value = h; c.font = { bold: true }; c.alignment = { horizontal: "center" }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEF5" } }; c.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } }; });
  const itemVals = ["{{item.no}}", "{{item.description}}", "{{item.qty}}", "{{item.unit}}", "{{item.unit_price}}", "{{item.amount}}", "{{item.remarks}}"];
  itemVals.forEach((v, j) => { const c = ws.getCell(15, j + 1); c.value = v; c.border = { top: { style: "hair" }, bottom: { style: "hair" }, left: { style: "thin" }, right: { style: "thin" } }; if (j === 4 || j === 5) c.numFmt = "#,##0"; });
  ws.getCell(17, 5).value = "小計"; ws.getCell(17, 6).value = "{{subtotal}}"; ws.getCell(17, 6).numFmt = "#,##0";
  ws.getCell(18, 5).value = "消費税"; ws.getCell(18, 6).value = "{{tax}}"; ws.getCell(18, 6).numFmt = "#,##0";
  ws.getCell(19, 5).value = "合計"; ws.getCell(19, 6).value = "{{total}}"; ws.getCell(19, 6).numFmt = "#,##0"; ws.getCell(19, 5).font = { bold: true }; ws.getCell(19, 6).font = { bold: true };
  ws.getCell(21, 1).value = "備考"; ws.mergeCells(21, 2, 23, 7); ws.getCell(21, 2).value = "{{notes}}"; ws.getCell(21, 2).alignment = { wrapText: true, vertical: "top" };
  ws.getCell(25, 1).value = "※ このシートの {{ }} が差し込み位置です。自社の書式に合わせてセルを動かし、ロゴや印影を足して、設定画面から登録してください。明細は {{item.…}} の行が明細数だけ複製されます。";
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}

/** 得意先から届いた Excel を、AI に渡せるプレーンテキスト（タブ区切り）に変換する。 */
export async function excelToText(buffer: Buffer, maxRows = 300): Promise<string> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const out: string[] = [];
  wb.eachSheet((ws) => {
    out.push(`### シート: ${ws.name}`);
    let n = 0;
    ws.eachRow((row) => {
      if (n++ >= maxRows) return;
      const cells = (row.values as unknown[]).slice(1).map((v) => {
        if (v == null) return "";
        if (typeof v === "object" && v !== null && "result" in v) return String((v as { result: unknown }).result ?? "");
        if (typeof v === "object" && v !== null && "richText" in v) return (v as { richText: { text: string }[] }).richText.map((t) => t.text).join("");
        if (v instanceof Date) return v.toISOString().slice(0, 10);
        return String(v);
      });
      if (cells.some((c) => c.trim())) out.push(cells.join("\t"));
    });
  });
  return out.join("\n");
}

/** 伝票計上指示を Excel に出力する（事務員が基幹に入力する前提。確認事項は赤字）。 */
export async function keijoToExcel(sheet: import("./keijo").KeijoSheet, settings: Settings): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = settings.company_name;
  const ws = wb.addWorksheet("計上指示", { pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true } });
  const q = sheet.quote;
  ws.getCell("A1").value = "伝票計上指示"; ws.getCell("A1").font = { size: 16, bold: true };
  const head: [string, string | number][] = [
    ["見積番号", q.quote_no], ["得意先コード", sheet.customer_code], ["得意先", q.customer.name], ["担当者", q.customer.contact_name ?? ""],
    ["件名", q.subject], ["受注日", q.closed_at?.slice(0, 10) ?? ""], ["納期", q.promised_delivery ?? q.requested_delivery ?? ""], ["支払条件", q.customer.payment_terms], ["営業担当", settings.sales_rep],
  ];
  head.forEach(([k, v], i) => { ws.getCell(3 + i, 1).value = k; ws.getCell(3 + i, 1).font = { bold: true }; ws.getCell(3 + i, 2).value = v; });
  if (sheet.flags.length) { ws.getCell(3, 5).value = "確認事項"; ws.getCell(3, 5).font = { bold: true, color: { argb: "FFB91C1C" } }; sheet.flags.forEach((f, i) => { ws.getCell(4 + i, 5).value = f; ws.getCell(4 + i, 5).font = { color: { argb: "FFB91C1C" } }; }); }
  const r0 = 3 + head.length + 1;
  const cols = ["行", "商品コード", "品番", "品名", "数量", "単位", "売単価", "売金額", "仕入先コード", "仕入先", "仕入単価", "仕入金額", "粗利%", "納期", "確認事項"];
  ws.columns = [{ width: 4 }, { width: 10 }, { width: 12 }, { width: 34 }, { width: 7 }, { width: 6 }, { width: 10 }, { width: 12 }, { width: 10 }, { width: 22 }, { width: 10 }, { width: 12 }, { width: 7 }, { width: 11 }, { width: 50 }];
  cols.forEach((c, i) => { const cell = ws.getCell(r0, i + 1); cell.value = c; cell.font = { bold: true }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEF5" } }; cell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } }; });
  sheet.rows.forEach((row, i) => {
    const r = r0 + 1 + i;
    const vals: (string | number)[] = [row.line_no, row.product_code, row.part_number, row.description, row.qty, row.unit, row.sell_price, row.sell_amount, row.supplier_code, row.supplier_name, row.cost, row.cost_amount, row.margin_pct, row.delivery, row.flags.join(" / ")];
    vals.forEach((v, j) => { const cell = ws.getCell(r, j + 1); cell.value = v; cell.border = { top: { style: "hair" }, bottom: { style: "hair" }, left: { style: "thin" }, right: { style: "thin" } }; if ([6, 7, 10, 11].includes(j)) cell.numFmt = "#,##0"; if (j === 14 && row.flags.length) cell.font = { color: { argb: "FFB91C1C" } }; });
    if (row.flags.length) ws.getCell(r, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
  });
  const rt = r0 + 1 + sheet.rows.length;
  ws.getCell(rt, 7).value = "合計"; ws.getCell(rt, 7).font = { bold: true };
  ws.getCell(rt, 8).value = sheet.total_sell; ws.getCell(rt, 8).numFmt = "#,##0"; ws.getCell(rt, 8).font = { bold: true };
  ws.getCell(rt, 12).value = sheet.total_cost; ws.getCell(rt, 12).numFmt = "#,##0";
  ws.getCell(rt, 13).value = sheet.total_sell ? Math.round(((sheet.total_sell - sheet.total_cost) / sheet.total_sell) * 1000) / 10 : 0;
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}
