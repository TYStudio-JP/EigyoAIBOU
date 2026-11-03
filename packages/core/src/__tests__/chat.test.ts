import { test, before } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../db/connection";
import { seedDatabase } from "../seed/seed";
import { chatTools } from "../ai/chat";
import { getChatTurns, saveChatTurns, clearChat } from "../domain/repo";

const db = openDb(":memory:");
before(() => { seedDatabase(db, { asOf: "2026-11-02" }); });

test("チャットの道具が揃っていて、価格照合の道具が事実を返す", async () => {
  const ctx = { userId: null, used: [] as string[], links: [] as { label: string; href: string }[] };
  const tools = chatTools(db, ctx);
  assert.ok(tools.length >= 15);
  const propose = tools.find((t) => t.name === "propose_price")!;
  const run = propose.run as unknown as (a: unknown) => Promise<string> | string;
  const out = JSON.parse(String(await run({ customer: "東海精密", product: "EM-10-4F", qty: 10, unit_price: 7000 }))) as { proposed_price: number; discount_floor: number; checks: string[] };
  assert.ok(out.proposed_price > 0 && out.discount_floor > 0);
  assert.ok(ctx.used.includes("価格照合"));
  const brief = tools.find((t) => t.name === "visit_brief")!;
  await (brief.run as unknown as (a: unknown) => Promise<string> | string)({ customer: "東海精密" });
  assert.ok(ctx.links.some((l) => l.href.endsWith("/brief")));
});

test("チャット履歴の保存・取得・削除", () => {
  saveChatTurns(db, 1, [{ role: "user", text: "こんにちは", at: "2026-11-02 10:00:00" }]);
  assert.equal(getChatTurns<{ text: string }>(db, 1)[0].text, "こんにちは");
  clearChat(db, 1);
  assert.equal(getChatTurns(db, 1).length, 0);
});
