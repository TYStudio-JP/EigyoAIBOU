import { test, before } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../db/connection";
import { seedDatabase } from "../seed/seed";
import { matchCustomerCandidates } from "../domain/customer-match";

const db = openDb(":memory:");
before(() => { seedDatabase(db, { asOf: "2026-11-05" }); });
const codes = (hint: string | null, contact?: string | null) => matchCustomerCandidates(db, hint, contact).map((c) => c.code);

test("得意先の名寄せ：括弧つき・敬称つきの書き方でもひとつに決まる", () => {
  assert.deepEqual(codes("みどり食品"), ["C003"]);
  assert.deepEqual(codes("みどり食品（みどり食品株式会社）"), ["C003"], "AI が一覧の書式のまま返しても当たる");
  assert.deepEqual(codes("みどり食品（みどり食品株式会社／担当 高橋 誠）"), ["C003"]);
  assert.deepEqual(codes("みどり食品の高橋です"), ["C003"]);
  assert.deepEqual(codes("東海精密工業株式会社 御中"), ["C001"]);
});

test("得意先の名寄せ：社名で決まらなければ相手の名前で絞る・補う", () => {
  assert.deepEqual(codes(null, "高橋 誠"), ["C003"], "社名が読めなくても担当者名から");
  assert.deepEqual(codes("どこかの会社", "佐藤 健一"), ["C001"]);
  assert.ok(codes("株式会社").length !== 1, "手がかりにならない語では決めない");
  assert.deepEqual(codes(null, null), []);
});
