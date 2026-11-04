import { test, before } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../db/connection";
import { seedDatabase } from "../seed/seed";
import { createQuote, createVisit, findProducts, listCustomers, listSuppliers, listUsers, listVisits, saveSettings, updateCustomer } from "../domain/repo";
import { dateOf, homeMode, matchCustomerByText, nextVisit, parseIcs, stampOf, syncIcsText } from "../domain/visits";
import { extractSupplierReplyFallback, recordSupplierQuote } from "../domain/supplier-quote";

const db = openDb(":memory:");
before(() => { seedDatabase(db, { asOf: "2026-11-02" }); });

const ICS = `BEGIN:VCALENDAR\r
VERSION:2.0\r
BEGIN:VEVENT\r
UID:ev1@example\r
DTSTART;TZID=Asia/Tokyo:20261105T140000\r
DTEND;TZID=Asia/Tokyo:20261105T150000\r
SUMMARY:東海精密 打合せ（第2ライ\r
 ン）\r
LOCATION:愛知県\\, 本社工場\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:ev2@example\r
DTSTART;VALUE=DATE:20261106\r
SUMMARY:社内会議\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:ev3@example\r
DTSTART:20261105T000000Z\r
SUMMARY:みどり食品 高橋様 訪問\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:ev4@example\r
DTSTART;TZID=Asia/Tokyo:20261107T100000\r
STATUS:CANCELLED\r
SUMMARY:キャンセル済み\r
END:VEVENT\r
END:VCALENDAR\r
`;

test("iCal：折り返し行・TZID・終日・UTC・キャンセルを正しく読む", () => {
  const ev = parseIcs(ICS);
  assert.equal(ev.length, 3, "キャンセルは除外");
  assert.equal(ev[0].summary, "東海精密 打合せ（第2ライン）");
  assert.equal(ev[0].location, "愛知県, 本社工場");
  assert.equal(ev[0].starts_at, "2026-11-05 14:00"); assert.equal(ev[0].ends_at, "2026-11-05 15:00");
  assert.equal(ev[1].all_day, true); assert.equal(ev[1].starts_at, "2026-11-06 09:00");
  // UTC 0:00 → ローカル時刻に変換される（実行環境のタイムゾーン）
  assert.equal(ev[2].starts_at, stampOf(new Date(Date.UTC(2026, 10, 5, 0, 0))));
});

test("得意先の推定：社名・略称・担当者名から当てる", () => {
  assert.equal(matchCustomerByText(db, "東海精密 打合せ")?.code, "C001");
  assert.equal(matchCustomerByText(db, "みどり食品株式会社 訪問")?.code, "C003");
  assert.equal(matchCustomerByText(db, "高橋様と面談")?.code, "C003");
  assert.equal(matchCustomerByText(db, "社内会議"), null);
});

test("カレンダー取り込みは同じ UID を更新し、消えた予定を削除し、手で直した得意先を保つ", () => {
  const me = listUsers(db)[0];
  const now = new Date(2026, 10, 3, 9, 0);
  const r1 = syncIcsText(db, me.id, ICS, now);
  assert.equal(r1.created, 3); assert.equal(r1.matched, 2);
  const r2 = syncIcsText(db, me.id, ICS, now);
  assert.equal(r2.created, 0); assert.equal(r2.updated, 3);
  const list = listVisits(db, { userId: me.id, from: "2026-11-01 00:00", to: "2026-11-30 23:59" });
  assert.equal(list.filter((v) => v.source === "ics").length, 3);
  // ev2 を消した ICS で同期 → 削除される
  const less = ICS.replace(/BEGIN:VEVENT\r\nUID:ev2@example[\s\S]*?END:VEVENT\r\n/, "");
  const r3 = syncIcsText(db, me.id, less, now);
  assert.equal(r3.removed, 1);
});

test("ホームの切替：訪問 10 分前から『次の訪問』、それ以外は『返事待ち』", () => {
  const me = listUsers(db)[0];
  const tokai = listCustomers(db).find((c) => c.code === "C001")!;
  createVisit(db, { user_id: me.id, customer_id: tokai.id, title: "東海精密", starts_at: "2026-11-10 14:00", ends_at: "2026-11-10 15:00" });
  saveSettings(db, { brief_switch_minutes: 10 });
  assert.equal(homeMode(db, me.id, dateOf("2026-11-10 13:30")).mode, "inbox");
  const at9 = homeMode(db, me.id, dateOf("2026-11-10 13:51"));
  assert.equal(at9.mode, "brief"); assert.equal(at9.next?.minutes_until, 9);
  assert.equal(homeMode(db, me.id, dateOf("2026-11-10 14:20")).mode, "brief", "訪問中も brief");
  assert.equal(homeMode(db, me.id, dateOf("2026-11-10 17:00")).mode, "inbox", "終わったら inbox");
  assert.equal(nextVisit(db, me.id, dateOf("2026-11-10 13:00"))?.visit.title, "東海精密");
  // 得意先が紐づいていない予定では brief にしない
  createVisit(db, { user_id: me.id, customer_id: null, title: "社内", starts_at: "2026-11-11 10:00" });
  assert.equal(homeMode(db, me.id, dateOf("2026-11-11 09:55")).mode, "inbox");
});

test("メーカー回答：仕入れ単価を入れると得意先ルールで売単価が出て、仕入れ履歴と納期にも反映", () => {
  const shonan = listCustomers(db).find((c) => c.code === "C006")!; // 掛率 1.3・10 円単位
  updateCustomer(db, shonan.id, { pricing_mode: "markup", markup_rate: 1.3, rounding_unit: 10 });
  const gloves = findProducts(db, "HG-12")[0];
  const s01 = listSuppliers(db).find((s) => s.code === "S01")!;
  const q = createQuote(db, { customer_id: shonan.id, subject: "メーカー回答テスト", items: [{ product_id: gloves.id, description: "軍手", qty: 50, unit: "組", unit_price: 800, cost: 510, supplier_id: s01.id }] });
  const r = recordSupplierQuote(db, q.id, q.items[0].id, { price: 540, delivery: "2026-11-12", valid_until: "2026-12-31", min_lot: 12, apply_rule: true });
  assert.equal(r.item.cost, 540);
  assert.equal(r.rule_price, 700); // 540 × 1.3 = 702 → 10 円単位切り捨て
  assert.equal(r.item.unit_price, 700);
  assert.equal(r.item.supplier_delivery, "2026-11-12");
  assert.equal(r.item.supplier_quote_valid_until, "2026-12-31");
  assert.equal(r.quote.promised_delivery, "2026-11-13");
  // apply_rule 無しなら売単価は変えない
  const r2 = recordSupplierQuote(db, q.id, q.items[0].id, { price: 560 });
  assert.equal(r2.item.unit_price, 700); assert.equal(r2.rule_price, 720); assert.equal(r2.applied_unit_price, null);
});

test("回答メールの簡易抽出：単価・納期・有効期限・最小ロット", () => {
  const f = extractSupplierReplyFallback("お世話になります。純綿軍手 12双組 の単価は ¥540 でご案内します。納期は 2026/11/12 出荷予定、有効期限 2026年12月31日、最小ロット 12 組となります。", "2026-11-04");
  assert.equal(f.unit_price, 540);
  assert.equal(f.delivery, "2026-11-12");
  assert.equal(f.valid_until, "2026-12-31");
  assert.equal(f.min_lot, 12);
});
