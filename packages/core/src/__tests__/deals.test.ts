import { test, before } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../db/connection";
import { seedDatabase } from "../seed/seed";
import { createQuote, findProducts, getQuote, listCustomers, listDeals, listUsers, pastCustomersOfUser, listContacts, createCall, updateCall, getCall } from "../domain/repo";
import { attachQuoteToDeal, attachCallToDeal, deriveDealStatus, dealTimeline, scoreDealCandidates } from "../domain/deals";
import { handoverCustomer } from "../domain/handover";
import { executeCallRequests } from "../domain/call-actions";

const db = openDb(":memory:");
before(() => { seedDatabase(db, { asOf: "2026-11-02" }); });

test("既存データが案件にまとまり、状態が見積りから導かれる", () => {
  const deals = listDeals(db, { limit: 1000 });
  assert.ok(deals.length > 50);
  for (const d of deals.slice(0, 20)) assert.equal(d.status, deriveDealStatus(db, d.id, "2026-11-02"));
  const tokai = listCustomers(db).find((c) => c.code === "C001")!;
  assert.ok(listDeals(db, { customerId: tokai.id, openOnly: true }).some((d) => d.title === "第2ライン立ち上げ"));
});

test("同じ商品・同じ話の見積りは既存案件へ、違う話は新規案件になる", async () => {
  const tokai = listCustomers(db).find((c) => c.code === "C001")!;
  const endmill = findProducts(db, "EM-10-4F")[0];
  const q = createQuote(db, { customer_id: tokai.id, subject: "第2ライン エンドミル追加", items: [{ product_id: endmill.id, description: endmill.name, qty: 5, unit: "本", unit_price: 7700, cost: 5390, supplier_id: null }] });
  const dec = await attachQuoteToDeal(db, q.id);
  assert.equal(dec.created, false);
  assert.equal(dec.deal.title, "第2ライン立ち上げ");
  assert.equal(getQuote(db, q.id)!.deal_id, dec.deal.id);
  const mask = findProducts(db, "HD-95")[0];
  const q2 = createQuote(db, { customer_id: tokai.id, subject: "新工場 防塵マスク", items: [{ product_id: mask.id, description: mask.name, qty: 10, unit: "箱", unit_price: 2000, cost: 1400, supplier_id: null }] });
  const dec2 = await attachQuoteToDeal(db, q2.id);
  assert.equal(dec2.created, true);
  assert.ok(scoreDealCandidates(db, { customer_id: tokai.id, text: "防塵マスク", product_ids: [mask.id] })[0].deal.id === dec2.deal.id);
});

test("電話も案件に紐づき、電話から作った見積りは同じ案件に入る", async () => {
  const tokai = listCustomers(db).find((c) => c.code === "C001")!;
  const sato = listContacts(db, tokai.id).find((c) => c.name.startsWith("佐藤"))!;
  const call = createCall(db, { customer_id: tokai.id, contact_id: sato.id, memo: "第2ラインのエンドミル追加 5本" });
  const minutes = executeCallRequests(db, getCall(db, call.id)!, { summary: "第2ラインのエンドミル追加", counterpart: "佐藤", promises: [], rep_todos: [], next_contact: null, mood: null,
    requests: [{ kind: "quote_request", detail: "第2ライン用エンドミル φ10 を 5 本", product_query: null, qty: null, unit: null, asked_price: null, requested_delivery: null, quote_no: null, items: [{ product_query: "EM-10-4F", qty: 5 }] }] });
  updateCall(db, call.id, { minutes_json: JSON.stringify(minutes), status: "processed" });
  const dec = await attachCallToDeal(db, call.id);
  assert.ok(dec && !dec.created && dec.deal.title === "第2ライン立ち上げ");
  const qid = minutes.requests[0].result!.quote_id!;
  assert.equal(getQuote(db, qid)!.deal_id, dec!.deal.id);
  assert.ok(dealTimeline(db, dec!.deal.id).some((t) => t.kind === "call"));
});

test("得意先の引継ぎ：担当が移り、案件に前任者の目印が付き、前任者には過去の担当先として残る", () => {
  const users = listUsers(db);
  const [yamada, suzuki] = users;
  const midori = listCustomers(db).find((c) => c.code === "C003")!;
  assert.equal(midori.owner_user_id, yamada.id);
  handoverCustomer(db, midori.id, suzuki.id, { note: "育休のため" });
  assert.equal(listCustomers(db).find((c) => c.id === midori.id)!.owner_user_id, suzuki.id);
  assert.ok(pastCustomersOfUser(db, yamada.id).some((p) => p.customer.id === midori.id));
  const d = listDeals(db, { customerId: midori.id, openOnly: true })[0];
  assert.ok(d, "進行中の案件がある前提");
  assert.ok(dealTimeline(db, d.id).some((t) => t.kind === "handover" && t.body.includes("前回の担当者 山田 太郎")));
  assert.ok(d.summary_detail.includes("前回の担当者 山田 太郎"));
});
