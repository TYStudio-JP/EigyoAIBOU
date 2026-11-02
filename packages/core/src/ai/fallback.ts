import type { ExtractedRequest } from "./extract";

/** API キーが無い環境でも最低限動くよう、依頼文を正規表現で粗く構造化する。 */
export function extractQuoteRequestFallback(text: string, today: string): ExtractedRequest {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const items: ExtractedRequest["items"] = [];
  const qtyRe = /(.+?)[\s　]*[×xX✕]?[\s　]*(\d+)[\s　]*(箱|本|個|組|双|足|巻|束|缶|袋|台|枚|セット|ケース)?(?:[\s　]*(?:←|※|（|\().*)?$/;
  for (const raw of lines) {
    const l = raw.replace(/^[・\-・•*●○]\s*/, "");
    const m = l.match(qtyRe);
    if (!m || !/\d/.test(l)) continue;
    const name = m[1].replace(/[（(][^)）]*[)）]/g, " ").replace(/\s+/g, " ").trim();
    if (name.length < 2 || /納期|希望|までに|お願い|件名/.test(name)) continue;
    const pn = l.match(/[A-Z]{2,}-?\d+[A-Z0-9\-]*/i)?.[0] ?? null;
    items.push({ raw_text: raw, product_query: pn ?? name, part_number: pn, qty: Number(m[2]), unit: m[3] ?? null, is_new_for_customer: /初めて|新規/.test(raw), note: null });
  }
  // 冒頭の名乗り（「みどり食品の高橋です」）や署名から得意先を推定する材料を渡す
  const customer = lines.filter((l) => !/^件名|御中|ツヤ商事/.test(l) && /です|より|株式会社|有限会社|様$/.test(l)).slice(0, 3).join(" ") || null;
  return {
    customer_hint: customer,
    contact_name: null,
    subject: (lines.find((l) => l.startsWith("件名")) ?? "見積り依頼").replace(/^件名[:：]\s*/, "").slice(0, 40),
    requested_delivery: null,
    delivery_note: lines.find((l) => /納期|までに/.test(l)) ?? null,
    price_pressure: lines.find((l) => /安く|値引|競合|他社/.test(l)) ?? null,
    items,
    open_questions: ["AI未接続のため簡易抽出です。数量・納期を目視で確認してください（本日 " + today + "）"],
  };
}
