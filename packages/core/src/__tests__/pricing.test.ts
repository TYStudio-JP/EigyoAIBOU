import { test, before } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../db/connection";
import { seedDatabase } from "../seed/seed";
import { proposePrice, checkPrice, worstLevel } from "../domain/pricing";
import { getSettings, findProducts, listCustomers, priceHistory } from "../domain/repo";
import { crossSellCandidates } from "../domain/crosssell";
import { followupQueue } from "../domain/followup";

const db = openDb(":memory:");
before(() => { seedDatabase(db, { asOf: "2026-11-02" }); });

test("提案単価は同一得意先の直近受注単価を踏襲する", () => {
  const tokai = listCustomers(db).find((c) => c.code === "C001")!;
  const endmill = findProducts(db, "EM-10-4F")[0];
  const hist = priceHistory(db, endmill.id, { customerId: tokai.id });
  const p = proposePrice(db, endmill.id, tokai.id, 10);
  const lastWon = hist.find((h) => h.status === "won");
  assert.ok(lastWon, "受注履歴がある前提");
  assert.equal(p.proposed_price, lastWon!.unit_price);
  assert.ok(p.best_cost! < p.proposed_price);
  assert.ok(p.floor_price! > p.best_cost!);
});

test("原価割れは danger、前回より値下げは warn", () => {
  const tokai = listCustomers(db).find((c) => c.code === "C001")!;
  const endmill = findProducts(db, "EM-10-4F")[0];
  const p = proposePrice(db, endmill.id, tokai.id, 10);
  const s = getSettings(db);
  const red = checkPrice(p, p.best_cost! * 0.9, p.best_cost!, p.best_supplier_id, s);
  assert.ok(red.some((c) => c.code === "negative_margin" && c.level === "danger"));
  assert.equal(worstLevel(red), "danger");
  const drop = checkPrice(p, p.proposed_price * 0.9, p.best_cost!, p.best_supplier_id, s);
  assert.ok(drop.some((c) => c.code === "below_last_price"));
  const ok = checkPrice(p, p.proposed_price, p.best_cost!, p.best_supplier_id, s);
  assert.ok(!ok.some((c) => c.level === "danger" || c.level === "warn"), JSON.stringify(ok));
});

test("より安い仕入れルートがある場合に info を出す", () => {
  const midori = listCustomers(db).find((c) => c.code === "C003")!;
  const gloves = findProducts(db, "HG-12")[0];
  const p = proposePrice(db, gloves.id, midori.id, 100);
  assert.ok(p.supplier_options.length >= 2);
  const expensive = p.supplier_options[p.supplier_options.length - 1];
  const checks = checkPrice(p, p.proposed_price, expensive.cost, expensive.supplier_id, getSettings(db));
  assert.ok(checks.some((c) => c.code === "cheaper_route"));
});

test("横展開候補は同業で売れていて未購入の商品だけ", () => {
  const musashino = listCustomers(db).find((c) => c.code === "C013")!;
  const r = crossSellCandidates(db, musashino.id);
  assert.ok(r.peers.every((p) => p.customer.industry === "自動車部品"));
  assert.ok(r.candidates.length > 0);
  for (const c of r.candidates) assert.ok(c.peers.length > 0 && c.reference_price > 0);
});

test("追跡キューは提出済・追跡中のみで、古いものが先頭", () => {
  const q = followupQueue(db, "2026-11-02");
  assert.ok(q.length > 0);
  assert.ok(q.every((f) => f.quote.status === "submitted" || f.quote.status === "tracking"));
  const order = { overdue: 0, due: 1, soon: 2, fresh: 3 };
  for (let i = 1; i < q.length; i++) assert.ok(order[q[i - 1].urgency] <= order[q[i].urgency]);
});

test("商品検索は品番の記号ゆれを吸収する", () => {
  assert.equal(findProducts(db, "em104f")[0]?.code, "P3001");
  assert.equal(findProducts(db, "ゴミ袋 90L")[0]?.code, "P7003");
});
