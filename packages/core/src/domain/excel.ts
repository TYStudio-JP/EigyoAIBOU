import ExcelJS from "exceljs";
import type { QuoteWithItems, Settings } from "./types";

/** 見積書を Excel（一般的な商社書式）で出力する。 */
export async function quoteToExcel(q: QuoteWithItems, settings: Settings): Promise<Buffer> {
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
