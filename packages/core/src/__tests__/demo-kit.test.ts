/**
 * demo/01_マスタ取り込み の CSV が、初期データへそのまま（列の対応を手で直さずに）取り込めることを守るテスト。
 * 取り込み処理や列の同義語を変えたときに、デモ用ファイルが壊れたらここで気づく。
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { openDb } from "../db/connection";
import { seedDatabase } from "../seed/seed";
import { getQuote, listCustomers, listProducts, listSuppliers, listUsers } from "../domain/repo";
import { commitImport, previewImport, type ImportKind, type ImportResult } from "../domain/import";
import { proposePrice } from "../domain/pricing";
import { priceImpact } from "../domain/price-impact";
import { crossSellCandidates } from "../domain/crosssell";
import { parseIcs } from "../domain/visits";
import { extractSupplierReplyFallback } from "../domain/supplier-quote";

const db = openDb(":memory:");
const demo = (rel: string) => readFileSync(new URL(`../../../../demo/${rel}`, import.meta.url));
const results: Partial<Record<ImportKind, ImportResult>> = {};
const cust = (code: string) => listCustomers(db).find((c) => c.code === code)!;
const prod = (code: string) => listProducts(db).find((p) => p.code === code)!;
const supp = (code: string) => listSuppliers(db).find((s) => s.code === code)!;
let before014: ReturnType<typeof cust>, beforeS03: ReturnType<typeof supp>;

before(() => {
  seedDatabase(db, { asOf: "2026-11-05" });
  before014 = cust("C014"); beforeS03 = supp("S03");
  const files: [ImportKind, string][] = [["customers", "1_得意先マスタ.csv"], ["suppliers", "2_仕入先マスタ.csv"], ["products", "3_商品マスタ.csv"], ["supplier_prices", "4_仕入価格表.csv"], ["sales", "5_売上実績.csv"]];
  for (const [kind, name] of files) {
    const buf = demo(`01_マスタ取り込み/${name}`);
    const pv = previewImport(db, buf, kind);
    assert.deepEqual(pv.missing_required, [], `${name}: 必須列が自動で当たる`);
    assert.deepEqual(pv.headers.filter((h) => !Object.values(pv.mapping).includes(h)), [], `${name}: 使われない列が無い`);
    results[kind] = commitImport(db, buf, kind, pv.mapping);
  }
});

test("デモ CSV：5 種ともエラー行なしで取り込める（Shift_JIS）", () => {
  for (const r of Object.values(results)) { assert.deepEqual(r!.errors, [], r!.kind); assert.equal(r!.skipped, 0, r!.kind); }
  assert.deepEqual([results.customers!.inserted, results.customers!.updated], [5, 2]);
  assert.deepEqual([results.suppliers!.inserted, results.suppliers!.updated], [3, 1]);
  assert.deepEqual([results.products!.inserted, results.products!.updated], [13, 2]);
  assert.ok(results.sales!.quote_ids!.length > 30, "売上実績は伝票ごとの受注見積りになる");
  assert.ok(prod("P9102").name.includes("×") && prod("P3005").name.includes("φ"), "記号が化けない");
});

test("デモ CSV：空欄のセルは既存の値を消さない（数値列も 0 にしない）", () => {
  const c014 = cust("C014");
  assert.equal(c014.markup_rate, 1.28); assert.equal(c014.pricing_mode, "markup");
  assert.equal(c014.notes, before014.notes); assert.equal(c014.tel, before014.tel); assert.equal(c014.owner_user_id, before014.owner_user_id);
  const s03 = supp("S03");
  assert.equal(s03.lead_time_days, 8, "標準納期だけ更新");
  assert.equal(s03.markup_rate, beforeS03.markup_rate, "空欄の標準掛率は元のまま（0 にならない）");
  assert.equal(s03.contact_email, beforeS03.contact_email);
  assert.equal(prod("P1002").list_price, 1850, "空欄の標準価格は元のまま");
  assert.equal(supp("S11").markup_rate, null);
});

test("デモ CSV：営業担当の列でユーザーに割り当てられる", () => {
  const users = listUsers(db);
  assert.equal(cust("C101").owner_user_id, users.find((u) => u.name === "山田 太郎")!.id);
  assert.equal(cust("C104").owner_user_id, users.find((u) => u.name === "鈴木 花子")!.id);
});

test("デモの筋書き：前回単価の踏襲・初回品は掛率・値上げ後は下限価格・横展開・価格改定の影響", () => {
  const c101 = cust("C101");
  const nogisu = proposePrice(db, prod("P9001").id, c101.id, 5);
  assert.equal(nogisu.proposed_price, 8800); assert.match(nogisu.proposal_basis, /踏襲/);
  const pin = proposePrice(db, prod("P9004").id, c101.id, 1);
  assert.equal(pin.proposed_price, 19950); assert.match(pin.proposal_basis, /掛率/);
  const oil = proposePrice(db, prod("P4001").id, c101.id, 6);
  assert.ok(oil.proposed_price > 9620, "仕入れ値上げ後は前回単価（9,620 円）のままにしない");
  assert.match(oil.proposal_basis, /下限/);
  const impact = priceImpact(db).rows.map((r) => `${r.customer.code}:${r.product.part_number}`);
  assert.ok(impact.includes("C101:CO-18") && impact.includes("C102:CL-20"), impact.join(" "));
  const tokai = crossSellCandidates(db, cust("C001").id, 20).candidates.map((c) => c.product.category);
  assert.ok(tokai.includes("測定工具"), "取り込んだ実績が既存得意先への提案になる");
  const q = getQuote(db, results.sales!.quote_ids![0])!;
  assert.equal(q.status, "won"); assert.ok(q.items.every((it) => it.cost > 0 && it.unit_price > it.cost));
});

test("デモの素材：iCal 7 件・メーカー回答メールが読める", () => {
  assert.equal(parseIcs(demo("06_訪問予定/訪問予定.ics").toString("utf8")).length, 7);
  const r = extractSupplierReplyFallback(demo("04_メーカー回答/回答メール_ミツワ精測.txt").toString("utf8"), "2026-11-05");
  assert.deepEqual([r.unit_price, r.delivery, r.valid_until, r.min_lot], [15400, "2026-11-20", "2026-12-25", 1]);
});
