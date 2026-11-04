import { test, before } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../db/connection";
import { seedDatabase } from "../seed/seed";
import { checkPrice, proposePrice } from "../domain/pricing";
import { floorTo, resolvePricingRule, rulePrice } from "../domain/pricing-rule";
import { createQuote, findProducts, getSettings, listCustomers, listSuppliers, replaceItems, updateCustomer, updateSupplier, upsertCustomer } from "../domain/repo";
import { formalDiff, isPendingFormal, markFormalSent, markProvisional, pendingFormalList, provisionalText } from "../domain/provisional";
import { replyQueue } from "../domain/inbox";
import { buildSelfMail, selfMailTo, smtpConfigured } from "../domain/self-mail";

const db = openDb(":memory:");
before(() => { seedDatabase(db, { asOf: "2026-11-02" }); });

test("値付けルール：掛率・粗利・端数切り捨てが決定的に計算される", () => {
  const markup = resolvePricingRule({ pricing_mode: "markup", markup_rate: 1.3, margin_pct: null, rounding_unit: 10 }, null)!;
  assert.equal(markup.mode, "markup");
  assert.equal(rulePrice(1000, markup), 1300);
  assert.equal(rulePrice(1234, markup), 1600); // 1604.2 → 10 円単位切り捨て
  const margin = resolvePricingRule({ pricing_mode: "margin", markup_rate: null, margin_pct: 25, rounding_unit: 100 }, null)!;
  assert.equal(rulePrice(750, margin), 1000); // 750 / 0.75 = 1000
  assert.equal(rulePrice(760, margin), 1000); // 1013.3 → 100 円単位切り捨て
  assert.equal(floorTo(1999, 1), 1999);
  // 得意先ルールが無ければ仕入れ先の標準掛率、どちらも無ければ null
  const sup = resolvePricingRule({ pricing_mode: "none", markup_rate: null, margin_pct: null, rounding_unit: 1 }, { markup_rate: 1.25 })!;
  assert.equal(sup.source, "supplier");
  assert.equal(rulePrice(1000, sup), 1250);
  assert.equal(resolvePricingRule({ pricing_mode: "none", markup_rate: null, margin_pct: null, rounding_unit: 1 }, { markup_rate: null }), null);
  // 得意先ルールは仕入れ先より優先
  assert.equal(resolvePricingRule({ pricing_mode: "markup", markup_rate: 1.5, margin_pct: null, rounding_unit: 1 }, { markup_rate: 1.25 })!.rate, 1.5);
});

test("履歴が無い得意先では、いつもの掛率で提案単価が決まり、外れると off_rule が出る", () => {
  const c = upsertCustomer(db, { code: "C999", name: "テスト商事株式会社", short_name: "テスト商事", industry: "建設", prefecture: "東京都", contact_name: "試験 太郎", contact_email: null, tel: null, payment_terms: "月末締め翌月末払い", notes: "", pricing_mode: "markup", markup_rate: 1.4, rounding_unit: 10 });
  const gloves = findProducts(db, "HK-5L")[0];
  const p = proposePrice(db, gloves.id, c.id, 30);
  assert.ok(p.rule && p.rule.source === "customer");
  assert.equal(p.proposed_price, p.rule_price);
  assert.equal(p.rule_price, floorTo(p.best_cost! * 1.4, 10));
  assert.match(p.proposal_basis, /掛率 1\.40/);
  const s = getSettings(db);
  const off = checkPrice(p, p.rule_price! * 1.2, p.best_cost!, p.best_supplier_id, s);
  assert.ok(off.some((x) => x.code === "off_rule"));
  const on = checkPrice(p, p.rule_price!, p.best_cost!, p.best_supplier_id, s);
  assert.ok(!on.some((x) => x.code === "off_rule"));
  // 仕入れ先の標準掛率だけ設定した場合
  updateCustomer(db, c.id, { pricing_mode: "none" });
  const s03 = listSuppliers(db).find((x) => x.code === "S03")!;
  updateSupplier(db, s03.id, { markup_rate: 1.25 });
  const endmill = findProducts(db, "EM-10-4F")[0];
  const p2 = proposePrice(db, endmill.id, c.id, 10);
  if (p2.best_supplier_id === s03.id) assert.equal(p2.rule?.source, "supplier");
});

test("暫定回答→正式未送付→差異チェック→正式送付の流れ", () => {
  const tokai = listCustomers(db).find((c) => c.code === "C001")!;
  const endmill = findProducts(db, "EM-10-4F")[0];
  const q = createQuote(db, { customer_id: tokai.id, subject: "暫定回答テスト", source_type: "memo", items: [{ product_id: endmill.id, description: "超硬エンドミル（EM-10-4F）", qty: 20, unit: "本", unit_price: 7850, cost: 5200, supplier_id: null }] });
  assert.equal(q.status, "draft");
  const text = provisionalText(q, getSettings(db), "sms");
  assert.match(text, /7,850円/);
  assert.match(text, /正式なお見積書は追って/);
  const after = markProvisional(db, q.id, { channel: "sms", text });
  assert.equal(after.status, "submitted");
  assert.ok(after.provisional_at && after.submitted_at);
  assert.ok(isPendingFormal(after));
  assert.ok(pendingFormalList(db).some((x) => x.id === q.id));
  assert.equal(formalDiff(after).changed, false);
  // 帰社後に単価を変えると差異が出る
  replaceItems(db, q.id, [{ product_id: endmill.id, description: "超硬エンドミル（EM-10-4F）", qty: 20, unit: "本", unit_price: 7900, cost: 5200, supplier_id: null }]);
  const diff = formalDiff({ ...after, items: [{ ...after.items[0], unit_price: 7900 }] });
  assert.ok(diff.changed && diff.lines[0].includes("7,850円 → 7,900円"));
  const done = markFormalSent(db, q.id);
  assert.ok(done.formal_sent_at);
  assert.ok(!pendingFormalList(db).some((x) => x.id === q.id));
});

test("返事待ちリスト：正式未送付・下書き・電話メモ未入力が急ぎ順に並ぶ", () => {
  const tokai = listCustomers(db).find((c) => c.code === "C001")!;
  const gloves = findProducts(db, "HK-5L")[0];
  const q = createQuote(db, { customer_id: tokai.id, subject: "返事待ちテスト", source_type: "email", items: [{ product_id: gloves.id, description: "耐切創手袋", qty: 10, unit: "双", unit_price: 1200, cost: 900, supplier_id: null }] });
  markProvisional(db, q.id, { channel: "phone" });
  const items = replyQueue(db, { asOf: "2026-11-02" });
  assert.ok(items.some((x) => x.kind === "provisional" && x.url === `/quotes/${q.id}`));
  for (let i = 1; i < items.length; i++) assert.ok(items[i - 1].priority <= items[i].priority);
  for (const it of items) { assert.ok(it.todo.length > 0 && it.action.length > 0 && it.url.startsWith("/")); }
});

test("自分宛てメール：件名・転送用文面・チェック結果が組み立てられ、SMTP 未設定なら送信しない", () => {
  const tokai = listCustomers(db).find((c) => c.code === "C001")!;
  const endmill = findProducts(db, "EM-10-4F")[0];
  const q = createQuote(db, { customer_id: tokai.id, subject: "自分宛てテスト", items: [{ product_id: endmill.id, description: "超硬エンドミル（EM-10-4F）", qty: 5, unit: "本", unit_price: 7850, cost: 5200, supplier_id: null }] });
  const pkg = buildSelfMail(q, getSettings(db), [{ line_no: 1, description: "超硬エンドミル", checks: [{ code: "below_last_price", level: "warn", title: "前回単価より値下げ", detail: "" }] }], { appUrl: "http://localhost:3000" });
  assert.ok(pkg.subject.includes(q.quote_no) && pkg.subject.includes("転送用"));
  assert.ok(pkg.body.includes("前回単価より値下げ") && pkg.body.includes(`/quotes/${q.id}`));
  assert.ok(pkg.customer_body.includes(tokai.name));
  assert.equal(smtpConfigured(), Boolean(process.env.EIGYO_SMTP_HOST));
  assert.equal(selfMailTo({ email: "me@example.jp" }), "me@example.jp");
});
