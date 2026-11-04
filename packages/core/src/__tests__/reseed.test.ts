import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../db/connection";
import { seedDatabase } from "../seed/seed";
import { createInquiry, createShareItem, createVisit, dismissCrossSell, listCustomers, listInquiries, listProducts, listUsers, listVisits } from "../domain/repo";
import { replyQueue } from "../domain/inbox";
import { homeMode } from "../domain/visits";
import { dateOf } from "../domain/visits";
import { isPrivateHost } from "../domain/visits";

/** 外出先モードの表にデータがある状態で「ダミーデータを入れ直す」が外部キーで失敗しないこと。 */
test("問い合わせ・訪問・横展開の済み・共有があっても再投入できる", () => {
  const db = openDb(":memory:");
  seedDatabase(db, { asOf: "2026-11-02" });
  const me = listUsers(db)[0]; const c = listCustomers(db)[0]; const p = listProducts(db)[0];
  createInquiry(db, { user_id: me.id, customer_id: c.id, question: "テスト" });
  createVisit(db, { user_id: me.id, customer_id: c.id, title: "訪問", starts_at: "2026-11-05 10:00" });
  dismissCrossSell(db, c.id, p.id, "proposed");
  createShareItem(db, { token: "t", text: "x" });
  const r = seedDatabase(db, { asOf: "2026-11-02" });
  assert.equal(r.customers, 16);
  const me2 = listUsers(db)[0]; // 再投入でユーザー ID は振り直される
  // シードに入る外出先モードのサンプル：問い合わせ 2 件・今日の訪問 2 件
  const open = listInquiries(db, { status: ["open"] });
  assert.equal(open.length, 2);
  assert.ok(open.some((i) => i.kind === "equivalent" && i.customer?.code === "C003"));
  const visits = listVisits(db, { from: "2026-11-02 00:00", to: "2026-11-02 23:59" });
  assert.equal(visits.length, 2);
  assert.ok(replyQueue(db, { asOf: "2026-11-02" }).some((x) => x.kind === "inquiry_open"));
  // 14:55 なら午後の訪問（東海精密）に切り替わる
  const hm = homeMode(db, me2.id, dateOf("2026-11-02 14:55"));
  assert.equal(hm.mode, "brief"); assert.equal(hm.next?.visit.customer?.code, "C001");
});

test("iCal 取り込み先のホスト判定（社内・ループバック・メタデータを拒否）", () => {
  for (const h of ["localhost", "127.0.0.1", "10.0.0.5", "172.16.3.4", "172.31.255.1", "192.168.1.1", "169.254.169.254", "0.0.0.0", "printer.local", "::1", "fd00::1", "100.64.0.1"]) assert.equal(isPrivateHost(h), true, h);
  for (const h of ["calendar.google.com", "172.32.0.1", "8.8.8.8", "outlook.office365.com"]) assert.equal(isPrivateHost(h), false, h);
});
