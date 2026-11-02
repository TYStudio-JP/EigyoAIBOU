import { test, before } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../db/connection";
import { seedDatabase } from "../seed/seed";
import { createCall, findCustomerByTel, listCalls, listCustomers, getQuote } from "../domain/repo";
import { executeCallRequests } from "../domain/call-actions";
import type { CallMinutes } from "../domain/types";

const db = openDb(":memory:");
before(() => { seedDatabase(db, { asOf: "2026-11-02" }); });

test("電話番号から得意先を特定できる（表記ゆれを吸収）", () => {
  const tokai = listCustomers(db).find((c) => c.code === "C001")!;
  assert.equal(findCustomerByTel(db, "052-000-0101")?.id, tokai.id);
  assert.equal(findCustomerByTel(db, "+81520000101")?.id, tokai.id);
  assert.equal(findCustomerByTel(db, "0520000101")?.id, tokai.id);
  assert.equal(findCustomerByTel(db, "090-9999-9999"), null);
});

test("依頼事項を実行して結果が付く（価格・納期・見積り依頼）", () => {
  const tokai = listCustomers(db).find((c) => c.code === "C001")!;
  const call = createCall(db, { customer_id: tokai.id, direction: "in", memo: "test" });
  const minutes: CallMinutes = {
    summary: "s", counterpart: null, promises: [], rep_todos: [], next_contact: null, mood: null,
    requests: [
      { kind: "price", detail: "エンドミル", product_query: "EM-10-4F", qty: 10, unit: "本", asked_price: 100, requested_delivery: null, quote_no: null, items: [] },
      { kind: "delivery", detail: "切削油", product_query: "CO-18", qty: 8, unit: "缶", asked_price: null, requested_delivery: "2026-11-03", quote_no: null, items: [] },
      { kind: "quote_request", detail: "見積り", product_query: null, qty: null, unit: null, asked_price: null, requested_delivery: null, quote_no: null, items: [{ product_query: "HK-5L", qty: 20 }, { product_query: "軍手", qty: 50 }] },
      { kind: "product_inquiry", detail: "存在しない商品", product_query: "存在しないXYZ", qty: null, unit: null, asked_price: null, requested_delivery: null, quote_no: null, items: [] },
    ],
  };
  const r = executeCallRequests(db, call, minutes);
  assert.equal(r.requests[0].result?.status, "needs_human", "値引き下限を下回る希望は人の判断");
  assert.equal(r.requests[1].result?.status, "needs_human", "明日納品は間に合わない");
  assert.equal(r.requests[2].result?.status, "done");
  assert.ok(r.requests[2].result?.quote_id);
  const q = getQuote(db, r.requests[2].result!.quote_id!)!;
  assert.equal(q.items.length, 2);
  assert.ok(q.items.every((it) => it.unit_price > 0));
  assert.equal(r.requests[3].result?.status, "needs_human");
});

test("シードに通話サンプルが入っている", () => {
  const calls = listCalls(db);
  assert.ok(calls.some((c) => c.status === "open" && c.source === "android"));
  const done = calls.find((c) => c.status === "processed")!;
  assert.ok(done.minutes && done.minutes.requests.every((r) => r.result));
  assert.ok(done.mail_body);
});
