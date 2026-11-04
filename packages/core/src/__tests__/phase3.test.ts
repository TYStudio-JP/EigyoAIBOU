import { test, before } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../db/connection";
import { seedDatabase } from "../seed/seed";
import { createShareItem, deleteShareItem, getShareFile, getShareItem, listCustomers, listInquiries } from "../domain/repo";
import { answerInquiry, classifyInquiry, inquiryFacts, logInquiryFromText, productQueriesFromText } from "../domain/inquiries";
import { replyQueue } from "../domain/inbox";
import { identifyProduct } from "../domain/product-photo";
import { googleConfigured, mapGoogleEvent } from "../domain/google-calendar";

const db = openDb(":memory:");
before(() => { seedDatabase(db, { asOf: "2026-11-02" }); });

test("問い合わせの種類と商品の手がかりを文面から推定する", () => {
  assert.equal(classifyInquiry("HK-5L の M サイズは納期どれくらいですか"), "delivery");
  assert.equal(classifyInquiry("EM-10-4F の同等品はありますか"), "equivalent");
  assert.equal(classifyInquiry("切削油 18L の在庫ありますか"), "stock");
  assert.equal(classifyInquiry("軍手を 100 組だといくらになりますか"), "price");
  assert.equal(classifyInquiry("この手袋の耐切創レベルと材質を教えて"), "spec");
  const qs = productQueriesFromText("お世話になります。HK-5L と EM-10-4F の件、φ10 mm で合っていますか");
  assert.ok(qs.includes("HK-5L") && qs.includes("EM-10-4F"));
});

test("問い合わせを登録すると得意先が推定され、社内記録から回答材料と文面ができる", () => {
  const iq = logInquiryFromText(db, "みどり食品の高橋です。耐切創手袋 HK-5L を 30 双欲しいのですが、納期はいつ頃になりますか？", { channel: "mail" });
  assert.equal(iq.customer?.code, "C003");
  assert.equal(iq.kind, "delivery");
  const f = inquiryFacts(db, iq.id);
  assert.ok(f.products.length >= 1 && f.products[0].product.part_number === "HK-5L");
  assert.ok(f.products[0].earliest_delivery, "最短納品日が出る");
  assert.match(f.deterministic_answer, /高橋 誠 様/);
  assert.match(f.deterministic_answer, /最短 \d{4}\/\d{2}\/\d{2}/);
  assert.ok(!/円/.test(f.deterministic_answer) || f.inquiry.kind === "price", "納期の問い合わせに仕入れ値は出さない");
  // 返事待ちに出る
  assert.ok(replyQueue(db, { asOf: "2026-11-02" }).some((x) => x.kind === "inquiry_open" && x.url === `/inquiries/${iq.id}`));
  // 回答を記録すると消える
  answerInquiry(db, iq.id, f.deterministic_answer, "mail");
  assert.equal(listInquiries(db, { status: ["open"] }).some((x) => x.id === iq.id), false);
  assert.ok(!replyQueue(db, { asOf: "2026-11-02" }).some((x) => x.kind === "inquiry_open" && x.url === `/inquiries/${iq.id}`));
});

test("商品を特定できない問い合わせは『品番を教えて』になり、確認事項に出る", () => {
  const iq = logInquiryFromText(db, "この前のやつ、まだありますか？", { customer_id: listCustomers(db)[0].id });
  const f = inquiryFacts(db, iq.id);
  assert.equal(f.products.length, 0);
  assert.match(f.deterministic_answer, /品番または商品名/);
  assert.ok(f.open_points.some((p) => /商品を特定できません/.test(p)));
});

test("写真の読み取り結果を自社マスタに当てる（品番一致→品名→読めた文字）", () => {
  const r = identifyProduct(db, { maker: "東和切削工具", part_number: "EM-10-4F", name: null, spec: "φ10 4枚刃", category_guess: "切削工具", visible_text: ["EM-10-4F", "TOWA"], confidence: "high" });
  assert.equal(r.matches[0]?.product.part_number, "EM-10-4F");
  assert.equal(r.matches[0]?.how, "part_number");
  assert.ok(r.similar.every((p) => p.category.includes("切削") || "切削工具".includes(p.category)));
  assert.match(r.research_query, /EM-10-4F/);
  const none = identifyProduct(db, { maker: null, part_number: "ZZZ-999", name: "謎の部品", spec: null, category_guess: null, visible_text: [], confidence: "low" });
  assert.equal(none.matches.length, 0);
  assert.equal(none.research_query, "ZZZ-999 謎の部品");
});

test("共有メニューの一時保管：トークンで取り出せ、ファイルも保持し、削除できる", () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
  createShareItem(db, { token: "tok1", title: "見積依頼", text: "HK-5L 30双", url: "", file_name: "label.png", file_mime: "image/png", file_blob: png });
  const it = getShareItem(db, "tok1")!;
  assert.equal(it.text, "HK-5L 30双"); assert.equal(it.file_name, "label.png");
  const f = getShareFile(db, "tok1")!;
  assert.equal(f.mime, "image/png"); assert.equal(f.blob.length, 7); assert.equal(f.blob[0], 0x89);
  deleteShareItem(db, "tok1");
  assert.equal(getShareItem(db, "tok1"), null);
});

test("Google カレンダーの予定を訪問の行に変換する（終日・取り消し・場所）", () => {
  const m = mapGoogleEvent({ id: "abc", summary: " 東海精密 打合せ ", location: "本社", start: { dateTime: "2026-11-10T14:00:00+09:00" }, end: { dateTime: "2026-11-10T15:00:00+09:00" } })!;
  assert.equal(m.external_id, "google:abc"); assert.equal(m.title, "東海精密 打合せ"); assert.equal(m.place, "本社");
  assert.equal(m.starts_at.length, 16); assert.ok(m.ends_at);
  const allDay = mapGoogleEvent({ id: "d", summary: "展示会", start: { date: "2026-11-12" } })!;
  assert.equal(allDay.starts_at, "2026-11-12 09:00"); assert.equal(allDay.ends_at, null);
  assert.equal(mapGoogleEvent({ id: "x", status: "cancelled", start: { date: "2026-11-12" } }), null);
  assert.equal(googleConfigured(), Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET));
});
