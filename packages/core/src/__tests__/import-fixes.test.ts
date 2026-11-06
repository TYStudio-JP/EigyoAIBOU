import { test, before } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../db/connection";
import { seedDatabase } from "../seed/seed";
import { listCustomers, listProducts, listSuppliers, listUsers } from "../domain/repo";
import { commitImport, previewImport, type ImportKind } from "../domain/import";

const db = openDb(":memory:");
before(() => { seedDatabase(db, { asOf: "2026-11-05" }); });
const run = (kind: ImportKind, csv: string) => { const buf = Buffer.from(csv, "utf8"); const pv = previewImport(db, buf, kind); return { pv, res: commitImport(db, buf, kind, pv.mapping) }; };

test("取り込み：空欄のセルは既存値を保つ（数値の列も 0 で上書きしない）", () => {
  const s03 = listSuppliers(db).find((s) => s.code === "S03")!;
  assert.ok(s03.markup_rate && s03.markup_rate > 1, "前提：S03 には標準掛率がある");
  run("suppliers", "仕入先CD,仕入先名,区分,標準納期,メール,標準掛率\nS03,東和切削工具株式会社,,8,,\n");
  const after = listSuppliers(db).find((s) => s.code === "S03")!;
  assert.equal(after.lead_time_days, 8, "入力した列だけ変わる");
  assert.equal(after.markup_rate, s03.markup_rate, "空欄の掛率は元のまま");
  assert.equal(after.contact_email, s03.contact_email); assert.equal(after.route_type, s03.route_type);
  const p = listProducts(db).find((x) => x.code === "P1002")!;
  run("products", `商品CD,型番,品名,標準価格,規格\nP1002,,${p.name},,サイズ展開 M/L\n`);
  const p2 = listProducts(db).find((x) => x.code === "P1002")!;
  assert.equal(p2.list_price, p.list_price, "空欄の定価は元のまま"); assert.equal(p2.part_number, p.part_number); assert.equal(p2.spec, "サイズ展開 M/L");
  const { res } = run("supplier_prices", "商品CD,仕入先CD,仕入単価,最小ロット,納期,適用開始日\nP1002,S01,930,,,2026/11/01\n");
  assert.equal(res.inserted, 1, "最小ロット・納期が空欄でも取り込める");
});

test("取り込み：営業担当の列でユーザーに割り当て、見つからない名前は理由を返す", () => {
  const users = listUsers(db);
  const { pv, res } = run("customers", "得意先CD,得意先名,業種,営業担当,担当者名\nC801,架空テスト工業株式会社,電機,鈴木 花子,佐々木 一郎\nC802,架空テスト物流株式会社,物流,山田,\nC803,架空テスト建設株式会社,建設,だれか,\n");
  assert.equal(pv.mapping.owner, "営業担当"); assert.equal(pv.mapping.contact_name, "担当者名");
  const by = (code: string) => listCustomers(db).find((c) => c.code === code)!;
  assert.equal(by("C801").owner_user_id, users.find((u) => u.name === "鈴木 花子")!.id);
  assert.equal(by("C802").owner_user_id, users.find((u) => u.name === "山田 太郎")!.id, "ひとりに決まる姓でも当たる");
  assert.equal(by("C803").owner_user_id, null);
  assert.equal(res.inserted, 3); assert.equal(res.errors.length, 1); assert.match(res.errors[0], /営業担当「だれか」/);
});

test("取り込み：売上実績の「仕入先CD」が自動で当たり、作った見積りの ID を返す", () => {
  const { pv, res } = run("sales", "伝票番号,売上日,得意先CD,商品CD,数量,単価,原価,仕入先CD,件名\nT-1,2026/10/01,C001,P1002,10,1300,925,S01,テスト\nT-1,2026/10/01,C001,P1001,20,700,510,S01,テスト\n");
  assert.equal(pv.mapping.supplier_code, "仕入先CD");
  assert.equal(res.inserted, 1); assert.equal(res.quote_ids?.length, 1);
});
