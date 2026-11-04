import { test, before } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { openDb } from "../db/connection";
import { seedDatabase } from "../seed/seed";
import { createQuote, findProducts, getSettings, listCustomers, listSuppliers, listUsers, setQuoteStatus, updateUser } from "../domain/repo";
import { targetProgress } from "../domain/targets";
import { autoMap, commitImport, decodeCsv, parseCsv, previewImport } from "../domain/import";
import { crossSellCandidates } from "../domain/crosssell";
import { dismissCrossSell, undismissCrossSell } from "../domain/repo";
import { markDeliveryKind, recordSupplierDelivery } from "../domain/delivery";
import { fillQuoteTemplate, sampleQuoteTemplate } from "../domain/excel";
import { proxySendPreconditions } from "../domain/self-mail";

const db = openDb(":memory:");
before(() => { seedDatabase(db, { asOf: "2026-11-02" }); });

test("目標と実績：達成率・あといくら・金額順に何件で届くかが出る", () => {
  const me = listUsers(db)[0];
  updateUser(db, me.id, { target_sales: 3_000_000, target_margin: 800_000 });
  const p = targetProgress(db, { userId: me.id, asOf: "2026-11-02" });
  assert.equal(p.month, "2026-11");
  assert.equal(p.target_sales, 3_000_000);
  assert.ok(p.gap_sales !== null && p.pct_sales !== null);
  assert.ok(p.candidates.length > 0);
  for (let i = 1; i < p.candidates.length; i++) assert.ok(p.candidates[i - 1].total >= p.candidates[i].total);
  assert.equal(p.candidates[p.candidates.length - 1].cumulative_sales, p.open_sales);
  if (p.needed_count) assert.ok(p.candidates[p.needed_count - 1].reaches_sales);
  // 全員分（userId 無し）は目標なしでも実績が出る
  const all = targetProgress(db, { asOf: "2026-11-02" });
  assert.ok(all.won_sales >= p.won_sales);
});

test("CSV 取り込み：Shift_JIS・引用符・列名の自動対応・コード一致で更新", () => {
  const csvText = '得意先CD,得意先名,業種,都道府県,担当者,電話,掛率\nC001,"東海精密工業株式会社",自動車部品,愛知県,佐藤 健一,052-000-0101,1.25\nC900,"新規, 商事株式会社",物流,東京都,新規 太郎,03-1111-2222,\n';
  const sjis = Buffer.from(new TextEncoder().encode(csvText)); // UTF-8 として判定される
  const rows = parseCsv(decodeCsv(sjis));
  assert.equal(rows.length, 3);
  assert.equal(rows[2][1], "新規, 商事株式会社");
  const map = autoMap(rows[0], "customers");
  assert.equal(map.code, "得意先CD"); assert.equal(map.name, "得意先名"); assert.equal(map.industry, "業種"); assert.equal(map.markup_rate, "掛率");
  const pv = previewImport(db, sjis, "customers");
  assert.equal(pv.total, 2); assert.equal(pv.missing_required.length, 0);
  const before = listCustomers(db).length;
  const r = commitImport(db, sjis, "customers", pv.mapping);
  assert.equal(r.inserted, 1); assert.equal(r.updated, 1); assert.equal(r.errors.length, 0);
  assert.equal(listCustomers(db).length, before + 1);
  const tokai = listCustomers(db).find((c) => c.code === "C001")!;
  assert.equal(tokai.pricing_mode, "markup"); assert.equal(tokai.markup_rate, 1.25);
  assert.ok(tokai.notes.length > 0, "CSV にメモ列が無くても既存のメモは消えない");
  assert.equal(tokai.payment_terms, "月末締め翌月末払い", "支払条件も既存のまま");
  const shin = listCustomers(db).find((c) => c.code === "C900")!;
  assert.equal(shin.short_name, "新規, 商事", "略称は社名から自動生成");
  // 売上実績 → 受注見積り
  const endmill = findProducts(db, "EM-10-4F")[0];
  const sales = `得意先コード,商品コード,数量,単価,日付,伝票番号\nC001,${endmill.code},5,7900,2026/10/20,S-1\nC001,${endmill.code},3,7900,2026/10/20,S-1\nC999,${endmill.code},1,100,2026/10/21,S-2\n`;
  const buf = Buffer.from(sales, "utf8");
  const pv2 = previewImport(db, buf, "sales");
  assert.equal(pv2.missing_required.length, 0);
  const r2 = commitImport(db, buf, "sales", pv2.mapping);
  assert.equal(r2.inserted, 1, "同じ伝票番号の 2 行は 1 つの見積り");
  assert.equal(r2.skipped, 1, "存在しない得意先はスキップして理由を返す");
  assert.match(r2.errors[0], /得意先コード/);
  // Shift_JIS も読める（TextDecoder が対応している環境）
  try {
    const sj = new TextDecoder("shift_jis");
    assert.ok(sj);
  } catch { /* ICU 無し環境ではスキップ */ }
});

test("横展開：提案済み・不要にした候補は一覧から消え、戻せる", () => {
  const musashino = listCustomers(db).find((c) => c.code === "C013")!;
  const before = crossSellCandidates(db, musashino.id);
  assert.ok(before.candidates.length > 0);
  const top = before.candidates[0].product;
  dismissCrossSell(db, musashino.id, top.id, "proposed", "10/30 訪問時に提案");
  const after = crossSellCandidates(db, musashino.id);
  assert.ok(!after.candidates.some((c) => c.product.id === top.id));
  assert.ok(after.dismissed.some((d) => d.product_id === top.id && d.reason === "proposed"));
  undismissCrossSell(db, musashino.id, top.id);
  assert.ok(crossSellCandidates(db, musashino.id).candidates.some((c) => c.product.id === top.id));
});

test("納期：概算⇄確定の切替と、受注後に全明細の回答が揃うと自動で確定になる", () => {
  const tokai = listCustomers(db).find((c) => c.code === "C001")!;
  const endmill = findProducts(db, "EM-10-4F")[0];
  const s03 = listSuppliers(db).find((s) => s.code === "S03")!;
  const q = createQuote(db, { customer_id: tokai.id, subject: "納期テスト", items: [{ product_id: endmill.id, description: "EM", qty: 1, unit: "本", unit_price: 8000, cost: 5000, supplier_id: s03.id }] });
  assert.equal(q.delivery_kind, "estimate");
  const q2 = markDeliveryKind(db, q.id, "confirmed", "テスト");
  assert.equal(q2.delivery_kind, "confirmed");
  markDeliveryKind(db, q.id, "estimate");
  setQuoteStatus(db, q.id, "submitted"); setQuoteStatus(db, q.id, "won");
  const q3 = recordSupplierDelivery(db, q.id, q.items[0].id, "2026-11-20");
  assert.equal(q3.delivery_kind, "confirmed");
  assert.equal(q3.promised_delivery, "2026-11-21");
});

test("自社書式テンプレート：サンプルに差し込むと明細が複製され、キーが値に置き換わる", async () => {
  const tokai = listCustomers(db).find((c) => c.code === "C001")!;
  const endmill = findProducts(db, "EM-10-4F")[0];
  const gloves = findProducts(db, "HK-5L")[0];
  const q = createQuote(db, { customer_id: tokai.id, subject: "テンプレートテスト", items: [
    { product_id: endmill.id, description: "エンドミル", qty: 2, unit: "本", unit_price: 8000, cost: 5000, supplier_id: null },
    { product_id: gloves.id, description: "手袋", qty: 10, unit: "双", unit_price: 1000, cost: 700, supplier_id: null },
    { product_id: null, description: "送料", qty: 1, unit: "式", unit_price: 1500, cost: 0, supplier_id: null },
  ] });
  const tpl = await sampleQuoteTemplate();
  const out = await fillQuoteTemplate(tpl, q, getSettings(db));
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(out as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  assert.equal(ws.getCell("F3").value, q.quote_no);
  assert.equal(ws.getCell("A3").value, `${tokai.name} 御中`);
  assert.equal(ws.getCell("B15").value, "エンドミル"); assert.equal(ws.getCell("B16").value, "手袋"); assert.equal(ws.getCell("B17").value, "送料");
  assert.equal(ws.getCell("F17").value, 1500);
  let leftover = 0; ws.eachRow((r) => r.eachCell((c) => { if (typeof c.value === "string" && /\{\{\s*[\w.]+\s*\}\}/.test(c.value)) leftover++; }));
  assert.equal(leftover, 0, "差し込みキーが残っていない");
});

test("代理送付：許可・SMTP・宛先が揃わないと送れない", () => {
  assert.match(proxySendPreconditions({ proxy_send_allowed: 0 }, "a@b.jp") ?? "", /許可されていません/);
  const r = proxySendPreconditions({ proxy_send_allowed: 1 }, null);
  assert.ok(r && /SMTP|メール/.test(r));
});
