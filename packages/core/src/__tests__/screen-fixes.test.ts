import { test, before } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../db/connection";
import { seedDatabase } from "../seed/seed";
import { createCall, getCall, listCustomers, listDeals } from "../domain/repo";
import { dealTimeline, timelineLine } from "../domain/deals";
import { repFullName, repSurname } from "../domain/rep-name";
import { requestCallCancel, runCallProcess, startCallProcess } from "../domain/call-process";
import { hasApiKey } from "../ai/client";

const db = openDb(":memory:");
before(() => { seedDatabase(db, { asOf: "2026-11-04" }); });

test("名乗りは姓だけ（部署は飛ばす）", () => {
  assert.equal(repSurname("営業一課 山田 太郎"), "山田");
  assert.equal(repSurname("山田 太郎"), "山田");
  assert.equal(repSurname("山田太郎"), "山田太郎");
  assert.equal(repSurname("第二営業部 田所 花子"), "田所");
  assert.equal(repFullName("営業一課 山田 太郎"), "山田 太郎");
});

test("時系列の見出しに見積番号を出さず、AI 向けの 1 行には残す", () => {
  const deal = listDeals(db, { limit: 50 }).find((d) => d.quote_count > 0)!;
  const tl = dealTimeline(db, deal.id);
  const quotes = tl.filter((t) => t.kind === "quote");
  assert.ok(quotes.length > 0);
  for (const q of quotes) {
    assert.ok(["見積り提出", "見積り作成"].includes(q.title), q.title);
    assert.match(q.quote_no ?? "", /^Q\d{6}-\d{3}$/);
    assert.match(timelineLine(q), /Q\d{6}-\d{3}/);
  }
  for (const t of tl) assert.doesNotMatch(t.title, /Q\d{6}-\d{3}|（|\(/, t.title);
});

test("電話メモの処理は実行中→キャンセル要求→片付け、と状態が進む", async () => {
  const cust = listCustomers(db)[0];
  const call = createCall(db, { customer_id: cust.id, direction: "in", memo: "切削油 8 缶の納期を教えてほしい" });
  assert.equal(call.process_state, null);
  assert.equal(startCallProcess(db, call.id), true);
  assert.equal(getCall(db, call.id)!.process_state, "running");
  assert.equal(startCallProcess(db, call.id), false, "二重起動しない");
  requestCallCancel(db, call.id);
  assert.equal(getCall(db, call.id)!.process_state, "cancel");
  if (!hasApiKey()) {
    await runCallProcess(db, call.id);
    const after = getCall(db, call.id)!;
    assert.equal(after.process_state, null, "終わったら必ず片付く");
    assert.ok(after.process_error, "AI 未接続なら理由が残る");
    assert.equal(after.status, "open");
  }
});
