import { test, before } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../db/connection";
import { seedDatabase } from "../seed/seed";
import { getSettings, listCustomers, listQuotes, listUsers, getQuote } from "../domain/repo";
import { buildKeijo } from "../domain/keijo";
import { deliveryWaitingList, recordSupplierDelivery, deliveryNotice } from "../domain/delivery";
import { priceImpact } from "../domain/price-impact";
import { reportFacts, reportDraft, saveReport, getReport } from "../domain/report";
import { visitBrief } from "../domain/brief";
import { keijoToExcel } from "../domain/excel";

const db = openDb(":memory:");
before(() => { seedDatabase(db, { asOf: "2026-11-02" }); });

test("計上指示：受注見積りから行と確認事項が出る", async () => {
  const won = listQuotes(db, { status: ["won"], limit: 1 })[0];
  const sheet = buildKeijo(db, won.id, getSettings(db));
  assert.equal(sheet.rows.length, getQuote(db, won.id)!.items.length);
  assert.ok(sheet.rows.every((r) => r.product_code && r.supplier_code));
  const draft = listQuotes(db, { status: ["draft"], limit: 1 })[0];
  assert.ok(buildKeijo(db, draft.id, getSettings(db)).flags.some((f) => f.includes("受注確定前")));
  const buf = await keijoToExcel(sheet, getSettings(db));
  assert.ok(buf.length > 3000);
});

test("納期回答：記録すると回答納期が埋まり、得意先向け連絡文が作れる", () => {
  const w = deliveryWaitingList(db)[0];
  assert.ok(w, "待ちがある前提");
  let q = w.quote;
  for (const it of q.items.filter((x) => x.product_id)) q = recordSupplierDelivery(db, q.id, it.id, "2026-11-20");
  assert.equal(q.promised_delivery, "2026-11-21");
  const n = deliveryNotice(q, "株式会社ツヤ商事", "営業一課 山田 太郎");
  assert.ok(n.body.includes("2026/11/21") && n.subject.includes(q.quote_no));
  assert.ok(!deliveryWaitingList(db).some((x) => x.quote.id === q.id));
});

test("価格改定の影響：値上げシミュレーションで粗利割れが増える", () => {
  const base = priceImpact(db);
  const sim = priceImpact(db, { pct: 15, supplier_id: null, product_ids: [], category: null });
  const warnBase = base.rows.filter((r) => r.level !== "ok").length;
  const warnSim = sim.rows.filter((r) => r.level !== "ok").length;
  assert.ok(warnSim > warnBase);
  assert.ok(sim.rows.every((r) => r.cost_now >= r.cost_before));
});

test("日報：事実から下書きが作れ、保存・再取得できる", () => {
  const u = listUsers(db)[0];
  const f = reportFacts(db, "2026-11-02", u.id);
  const draft = reportDraft(f);
  assert.ok(draft.includes("営業日報 2026/11/02"));
  saveReport(db, "2026-11-02", u.id, draft + "\n- 所感テスト");
  assert.ok(getReport(db, "2026-11-02", u.id)!.includes("所感テスト"));
});

test("訪問前ブリーフ：進行中案件・担当者・話題が揃う", () => {
  const tokai = listCustomers(db).find((c) => c.code === "C001")!;
  const b = visitBrief(db, tokai.id);
  assert.ok(b.contacts.length >= 2 && b.open_deals.length >= 1 && b.talking_points.length >= 1);
});
