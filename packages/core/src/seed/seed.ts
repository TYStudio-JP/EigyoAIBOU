import type { Db } from "../db/connection";
import { CONTACTS, CUSTOMERS, END_CUSTOMERS, INDUSTRY_AFFINITY, PRODUCTS, SUPPLIERS } from "./data";
import {
  addActivity, addDays, addSupplierPrice, createCall, createContact, createEndCustomer, createInquiry, createQuote, createUser, createVisit, getSettings, listContacts, saveSettings, setCustomerOwner, setQuoteStatus, today, updateCall, updateDeal,
  upsertCustomer, upsertProduct, upsertSupplier, type NewQuoteItem,
} from "../domain/repo";
import { backfillDeals, listDealsForSeed } from "../domain/deals";
import { handoverCustomer } from "../domain/handover";
import { executeCallRequests } from "../domain/call-actions";
import type { CallMinutes } from "../domain/types";
import { DEFAULT_SETTINGS, type LostReason } from "../domain/types";

/** 決定的な乱数（デモが毎回同じ結果になるように）。 */
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SeedOptions { asOf?: string; seed?: number; quotes?: number }

export function seedDatabase(db: Db, opts: SeedOptions = {}): { customers: number; suppliers: number; products: number; quotes: number } {
  const asOf = opts.asOf ?? today();
  const rnd = mulberry32(opts.seed ?? 20261102);
  const pick = <T>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
  const between = (a: number, b: number) => a + rnd() * (b - a);

  // 外部キーの依存順に消す（子 → 親）。users は customers.owner_user_id から参照されるので最後。
  // 外出先モードで増えた表（問い合わせ・訪問予定・横展開の済み・メール履歴・共有の一時保管）も先に消す。消し忘れると customers の削除が外部キーで失敗する
  db.exec("DELETE FROM mail_log; DELETE FROM inquiries; DELETE FROM visits; DELETE FROM crosssell_dismissals; DELETE FROM share_inbox; DELETE FROM chats; DELETE FROM daily_reports; DELETE FROM customer_owners; DELETE FROM deal_events; DELETE FROM calls; DELETE FROM activities; DELETE FROM quote_items; DELETE FROM quotes; DELETE FROM deals; DELETE FROM end_customers; DELETE FROM contacts; DELETE FROM supplier_prices; DELETE FROM products; DELETE FROM suppliers; DELETE FROM customers; DELETE FROM users; DELETE FROM settings;");
  saveSettings(db, DEFAULT_SETTINGS);

  const customers = CUSTOMERS.map((c) => ({ ...upsertCustomer(db, c), discount: c.discount }));
  const byCode = new Map(customers.map((c) => [c.code, c]));
  // 自社の営業担当（ユーザー）。山田が大半を担当、鈴木が一部、田村は前任者（転勤済み）
  const yamada = createUser(db, { name: "山田 太郎", department: "営業一課", email: "yamada@tsuya.example.jp" });
  const suzukiU = createUser(db, { name: "鈴木 花子", department: "営業一課", email: "suzuki@tsuya.example.jp" });
  const tamura = createUser(db, { name: "田村 修", department: "営業二課（大阪へ転勤）", email: "tamura@tsuya.example.jp", status: "inactive" });
  for (const c of customers) setCustomerOwner(db, c.id, ["C004", "C009", "C014", "C016"].includes(c.code) ? suzukiU.id : c.code === "C008" ? tamura.id : yamada.id);
  const contactByName = new Map<string, number>();
  for (const k of CONTACTS) {
    const row = createContact(db, { customer_id: byCode.get(k.customer)!.id, name: k.name, department: k.department, title: k.title, tel: k.tel ?? null, mobile: k.mobile ?? null, email: k.email ?? null, status: k.status ?? "active", notes: k.notes ?? "", source: "seed" });
    contactByName.set(`${k.customer}:${k.name}`, row.id);
  }
  const endByName = new Map<string, number>();
  for (const e of END_CUSTOMERS) endByName.set(`${e.customer}:${e.name}`, createEndCustomer(db, { customer_id: byCode.get(e.customer)!.id, name: e.name, industry: e.industry, notes: e.notes ?? "" }).id);
  const activeContacts = (customerId: number) => listContacts(db, customerId).map((c) => c.id);
  const supplierByCode = new Map(SUPPLIERS.map((s) => [s.code, upsertSupplier(db, s)]));
  const products = PRODUCTS.map((p) => {
    const row = upsertProduct(db, p);
    for (const r of p.routes) {
      const sup = supplierByCode.get(r.supplier)!;
      addSupplierPrice(db, { product_id: row.id, supplier_id: sup.id, cost: Math.round(p.list_price * r.ratio), min_lot: r.min_lot, lead_time_days: r.lead ?? sup.lead_time_days, valid_from: "2024-01-01" });
      if (p.revised) {
        // 価格改定：各ルートとも同じ比率で上昇
        const bump = p.revised.ratio / p.routes[0].ratio;
        addSupplierPrice(db, { product_id: row.id, supplier_id: sup.id, cost: Math.round(p.list_price * r.ratio * bump), min_lot: r.min_lot, lead_time_days: r.lead ?? sup.lead_time_days, valid_from: p.revised.from });
      }
    }
    return { ...row, seed: p };
  });

  // 得意先ごとの「取扱品目」= 業種の親和カテゴリから抽選（得意先ごとに差が出るようにする）
  const assortment = new Map<number, typeof products>();
  for (const c of customers) {
    const aff = INDUSTRY_AFFINITY[c.industry];
    const pool = products.filter((p) => aff[p.category]);
    const chosen = pool.filter((p) => rnd() < Math.min(0.95, 0.25 + aff[p.category] * 0.12));
    assortment.set(c.id, chosen.length >= 3 ? chosen : pool.slice(0, 4));
  }

  const costAt = (productId: number, supplierId: number, date: string): number => {
    const row = db.prepare(
      "SELECT cost FROM supplier_prices WHERE product_id=? AND supplier_id=? AND valid_from<=? ORDER BY valid_from DESC LIMIT 1",
    ).get(productId, supplierId, date) as { cost: number } | undefined;
    return row?.cost ?? 0;
  };

  const start = addDays(asOf, -720);
  const total = opts.quotes ?? 150;
  let made = 0;
  const lostReasons: LostReason[] = ["price", "price", "delivery", "competitor", "cancelled", "other"];
  const lostDetails: Record<LostReason, string[]> = {
    price: ["他社が1割安かった", "予算超過のため見送り", "値引き交渉が折り合わず"],
    delivery: ["希望納期に間に合わず", "メーカー欠品で納期回答できず"],
    competitor: ["既存取引先に決定", "メーカー直販に切り替え"],
    cancelled: ["案件自体が延期", "設備投資が凍結"],
    other: ["理由不明（先方から回答なし）"],
  };

  // 時間軸：全体はほぼ一様、直近3週間に 16 件を追加して「動いている案件」を作る。古い順に採番する。
  const schedule: number[] = [];
  for (let i = 0; i < total; i++) schedule.push(Math.floor(rnd() * 720));
  for (let i = 0; i < 16; i++) schedule.push(Math.floor(rnd() * 21));
  schedule.sort((a, b) => b - a);
  for (const daysAgo of schedule) {
    const created = addDays(asOf, -daysAgo);
    if (created < start) continue;
    const c = pick(customers);
    const items: NewQuoteItem[] = [];
    const nItems = 1 + Math.floor(rnd() * 4);
    const cands = [...assortment.get(c.id)!];
    for (let k = 0; k < nItems && cands.length; k++) {
      const p = cands.splice(Math.floor(rnd() * cands.length), 1)[0];
      const routes = p.seed.routes;
      // 大口は メーカー直、小口は 代理店/商社
      const qtyBase = { 組: 50, 双: 30, 個: 10, 箱: 6, 足: 10, 巻: 10, 束: 10, 本: 5, 缶: 4, 袋: 10, 台: 2 }[p.unit] ?? 5;
      const qty = Math.max(1, Math.round(qtyBase * between(0.5, 2.5)));
      const route = qty >= (routes[0].min_lot) ? routes[0] : routes[routes.length - 1];
      const sup = supplierByCode.get(route.supplier)!;
      const cost = costAt(p.id, sup.id, created);
      // 顧客ごとの掛け率 ± 2%。年ごとに微妙にドリフト
      const drift = 1 + (720 - daysAgo) / 720 * 0.03;
      const price = Math.round((p.list_price * c.discount * between(0.98, 1.02) * drift) / 10) * 10;
      items.push({ product_id: p.id, description: `${p.name}（${p.part_number}）`, qty, unit: p.unit, unit_price: Math.max(price, Math.round(cost * 1.05)), cost, supplier_id: sup.id, supplier_delivery: addDays(created, (route.lead ?? sup.lead_time_days) + 1) });
    }
    if (!items.length) continue;
    const r = rnd();
    let status: "draft" | "submitted" | "tracking" | "won" | "lost";
    if (daysAgo <= 2) status = r < 0.5 ? "draft" : "submitted";
    else if (daysAgo <= 21) status = r < 0.15 ? "draft" : r < 0.55 ? "submitted" : r < 0.8 ? "tracking" : r < 0.92 ? "won" : "lost";
    else status = r < 0.72 ? "won" : "lost";
    const subjects = ["消耗品 定期分", "追加発注分", "新規ライン立ち上げ分", "年度更新分", "在庫補充分", "スポット分", "見積り依頼分"];
    const cIds = activeContacts(c.id);
    const q = createQuote(db, {
      customer_id: c.id,
      contact_id: cIds.length ? pick(cIds) : null,
      subject: `${created.slice(0, 7).replace("-", "年")}月 ${pick(subjects)}`,
      status: "draft",
      requested_delivery: addDays(created, 7 + Math.floor(rnd() * 14)),
      promised_delivery: addDays(created, 8 + Math.floor(rnd() * 10)),
      valid_until: addDays(created, 30),
      source_type: pick(["email", "email", "memo", "file", "manual"]),
      items,
      created_at: `${created} 09:${String(10 + Math.floor(rnd() * 49)).padStart(2, "0")}:00`,
    });
    if (status !== "draft") {
      const submitted = addDays(created, Math.floor(rnd() * 2));
      setQuoteStatus(db, q.id, "submitted", { at: `${submitted} 11:00:00` });
      if (status === "tracking" || ((status === "won" || status === "lost") && rnd() < 0.6)) {
        const fu = addDays(submitted, 3 + Math.floor(rnd() * 4));
        if (fu <= asOf) {
          setQuoteStatus(db, q.id, "tracking", { at: `${fu} 10:00:00` });
          addActivity(db, q.id, "followup", pick(["電話で状況確認。購買で検討中とのこと", "訪問時に確認。来週中に回答予定", "メールでフォロー。数量変更の可能性あり", "先方担当者不在。再度連絡予定"]), `${fu} 10:05:00`);
        }
      }
      if (status === "won" || status === "lost") {
        const closed = addDays(submitted, 5 + Math.floor(rnd() * 20));
        if (closed <= asOf) {
          if (status === "won") setQuoteStatus(db, q.id, "won", { at: `${closed} 15:00:00`, note: pick(["注文書受領", "口頭内示→注文書待ち", "そのまま受注"]) });
          else {
            const reason = pick(lostReasons);
            setQuoteStatus(db, q.id, "lost", { at: `${closed} 15:00:00`, lost_reason: reason, lost_detail: pick(lostDetails[reason]) });
          }
        }
      }
    }
    made++;
  }

  // デモ用に固定の「追跡が必要な案件」を 2 件追加
  const midori = customers.find((c) => c.code === "C003")!;
  const tokai = customers.find((c) => c.code === "C001")!;
  const prod = (code: string) => products.find((p) => p.code === code)!;
  const mk = (p: ReturnType<typeof prod>, qty: number, price: number, supCode: string, date: string): NewQuoteItem => ({
    product_id: p.id, description: `${p.name}（${p.part_number}）`, qty, unit: p.unit, unit_price: price,
    cost: costAt(p.id, supplierByCode.get(supCode)!.id, date), supplier_id: supplierByCode.get(supCode)!.id,
  });
  const d1 = addDays(asOf, -9);
  const q1 = createQuote(db, {
    customer_id: midori.id, contact_id: contactByName.get("C003:高橋 誠") ?? null, subject: "年末繁忙期向け 衛生・梱包資材", status: "draft", requested_delivery: addDays(asOf, 12), valid_until: addDays(d1, 30), source_type: "email",
    source_text: "高橋です。年末向けに工業用ワイパー 20箱、ゴミ袋90L 10箱、OPPテープ 8箱の見積りをお願いします。納期は再来週希望です。",
    items: [mk(prod("P7002"), 20, 6700, "S02", d1), mk(prod("P7003"), 10, 5300, "S02", d1), mk(prod("P2004"), 8, 5500, "S02", d1)],
    created_at: `${d1} 10:20:00`,
  });
  setQuoteStatus(db, q1.id, "submitted", { at: `${d1} 16:30:00` });
  const d2 = addDays(asOf, -16);
  const q2 = createQuote(db, {
    customer_id: tokai.id, contact_id: contactByName.get("C001:佐藤 健一") ?? null, subject: "第2ライン 切削工具・切削油", status: "draft", requested_delivery: addDays(asOf, 5), valid_until: addDays(d2, 30), source_type: "memo",
    source_text: "佐藤さんより電話。第2ラインの立ち上げでエンドミルφ10を10本、CNMGチップ5箱、切削油18Lを8缶。来月頭には必要。",
    items: [mk(prod("P3001"), 10, 7600, "S03", d2), mk(prod("P3003"), 5, 9300, "S03", d2), mk(prod("P4001"), 8, 10900, "S04", d2)],
    created_at: `${d2} 09:40:00`,
  });
  setQuoteStatus(db, q2.id, "submitted", { at: `${d2} 14:00:00` });
  setQuoteStatus(db, q2.id, "tracking", { at: `${addDays(d2, 4)} 10:00:00` });
  addActivity(db, q2.id, "followup", "訪問時に確認。購買の稟議中、競合1社あり（価格勝負になりそう）", `${addDays(d2, 4)} 10:10:00`);

  // 電話メモのサンプル：①Android から自動作成されたメモ未入力の通話 ②処理済みの通話（議事録・依頼の実行結果・確認メール）
  const sagami = customers.find((c) => c.code === "C012")!;
  createCall(db, { customer_id: sagami.id, contact_id: contactByName.get("C012:山田 亮") ?? null, tel: sagami.tel, direction: "in", started_at: `${asOf} 09:42:00`, duration_sec: 312, source: "android" });
  const call2 = createCall(db, {
    customer_id: tokai.id, contact_id: contactByName.get("C001:佐藤 健一") ?? null, tel: tokai.tel, direction: "in", started_at: `${addDays(asOf, -1)} 15:20:00`, duration_sec: 540, source: "manual",
    memo: "東海精密の佐藤さんから。第2ラインの件、エンドミルφ10の単価、前回7,720円だったけど競合が7,000円出してきたからなんとかならないかって。あと切削油18Lを8缶、来週水曜までに入れてほしい。それと防錆スプレーの24本入りの在庫あるか聞かれた。来週の火曜に訪問の約束した。",
  });
  const minutes2: CallMinutes = {
    summary: `・${addDays(asOf, -1)} 15:20 東海精密 佐藤様より入電（約9分）\n・第2ライン用エンドミル φ10 の単価について、競合が 7,000 円を提示との情報\n・水溶性切削油 18L × 8 缶を来週水曜までに納品希望\n・防錆剤スプレー 420ml 24本入の在庫有無の問い合わせ\n・来週火曜に訪問することで合意`,
    counterpart: "佐藤 健一 様（購買）",
    requests: [
      { kind: "price", detail: "超硬エンドミル φ10 4枚刃 の単価。競合提示 7,000 円に対抗できるか", product_query: "EM-10-4F", qty: 10, unit: "本", asked_price: 7000, requested_delivery: null, quote_no: null, items: [] },
      { kind: "delivery", detail: "水溶性切削油 18L を 8 缶、来週水曜までに納品希望", product_query: "CO-18", qty: 8, unit: "缶", asked_price: null, requested_delivery: addDays(asOf, 8), quote_no: null, items: [] },
      { kind: "product_inquiry", detail: "防錆剤スプレー 420ml 24本入の在庫有無", product_query: "RP-420", qty: 2, unit: "箱", asked_price: null, requested_delivery: null, quote_no: null, items: [] },
    ],
    promises: ["来週火曜 10:00 に訪問", "切削油の納期を本日中に回答"],
    rep_todos: ["エンドミルの対抗価格について上長に確認", "火曜訪問の準備（第2ライン立ち上げ品の提案）"],
    next_contact: `${addDays(asOf, 2)}（訪問）`,
    mood: "neutral",
  };
  const executed = executeCallRequests(db, { ...call2, minutes: null }, minutes2);
  updateCall(db, call2.id, {
    minutes_json: JSON.stringify(executed),
    status: "processed",
    mail_subject: "【ご確認】本日お電話いただいた件（エンドミル単価・切削油納期ほか）",
    mail_body: `東海精密工業株式会社\n佐藤 健一 様\n\nいつもお世話になっております。ツヤ商事 山田です。\n本日はお電話ありがとうございました。以下の通り承りましたのでご確認ください。\n\n1. 超硬エンドミル φ10 4枚刃（EM-10-4F）単価\n　ご提示いただいた 7,000 円について社内で確認のうえ、明日中にご回答いたします。\n2. 水溶性切削油 18L × 8 缶\n　${executed.requests[1].result?.headline ?? ""}\n3. 防錆剤スプレー 420ml 24本入\n　${executed.requests[2].result?.headline ?? ""}\n\n来週火曜 10:00 にお伺いいたします。引き続きよろしくお願いいたします。\n\n株式会社ツヤ商事 営業一課 山田 太郎\nTEL 03-0000-0000`,
  });

  // 案件：既存の見積り・通話を自動でまとめ直し、デモ用に件名と納入先を整える
  backfillDeals(db);
  for (const d of listDealsForSeed(db)) {
    const cust = customers.find((c) => c.id === d.customer_id)!;
    if (cust.kind === "dealer") {
      const ends = END_CUSTOMERS.filter((e) => e.customer === cust.code);
      const contactName = d.contact_id ? [...contactByName.entries()].find(([, id]) => id === d.contact_id)?.[0].split(":")[1] : undefined;
      const mine = ends.filter((e) => e.contact === contactName);
      const e = (mine.length ? mine : ends)[Math.floor(rnd() * (mine.length ? mine.length : ends.length))];
      if (e) updateDeal(db, d.id, { end_customer_id: endByName.get(`${cust.code}:${e.name}`) ?? null, title: `${e.name} 向け ${d.title.replace(/^\d{4}年\d{1,2}月 /, "")}` });
    }
  }
  const tokaiDeal = listDealsForSeed(db).find((d) => d.customer_id === tokai.id && d.status !== "won" && d.status !== "lost" && d.title.includes("第2ライン"));
  if (tokaiDeal) updateDeal(db, tokaiDeal.id, { title: "第2ライン立ち上げ", contact_id: contactByName.get("C001:佐藤 健一") ?? null, next_action: "エンドミルの対抗価格を上長確認のうえ回答。火曜訪問で第2ライン用の提案", next_action_due: addDays(asOf, 1) });

  // 引継ぎのデモ：日之出物流は田村（転勤）→ 山田 へ 3 か月前に引継ぎ済み
  const hinode = customers.find((c) => c.code === "C008")!;
  handoverCustomer(db, hinode.id, yamada.id, { at: `${addDays(asOf, -90)} 17:00:00`, note: "大阪支店へ転勤のため。年間契約の更新時期（1月）に注意。" });

  // 外出先モードのデモ：返事待ちに出る問い合わせ 2 件と、今日の訪問予定 2 件（午前は済み、午後が「次の訪問」）
  const midoriC = customers.find((c) => c.code === "C003")!;
  const shonanC = customers.find((c) => c.code === "C006")!;
  createInquiry(db, { user_id: yamada.id, customer_id: midoriC.id, contact_id: contactByName.get("C003:高橋 誠") ?? null, channel: "mail", kind: "equivalent", question: "みどり食品の高橋です。いま使っている耐切創手袋 HK-5L が廃番になると聞きました。同等品で食品工場で使えるものはありますか？ 価格も教えてください。", source: "seed", due: addDays(asOf, 1) });
  createInquiry(db, { user_id: yamada.id, customer_id: shonanC.id, contact_id: contactByName.get("C006:渡辺 大輔") ?? null, channel: "line", kind: "delivery", question: "湘南建設 渡辺です。安全靴 HS-26 を 9 足、来週の月曜までに現場へ入れられますか？", source: "seed" });
  createVisit(db, { user_id: yamada.id, customer_id: sagami.id, title: "相模電機 定期訪問", starts_at: `${asOf} 10:00`, ends_at: `${asOf} 11:00`, place: "本社", source: "manual" });
  createVisit(db, { user_id: yamada.id, customer_id: tokai.id, title: "東海精密 第2ライン打合せ", starts_at: `${asOf} 15:00`, ends_at: `${asOf} 16:00`, place: "本社工場 会議室", source: "manual" });

  getSettings(db);
  return { customers: customers.length, suppliers: SUPPLIERS.length, products: products.length, quotes: made + 2 };
}
