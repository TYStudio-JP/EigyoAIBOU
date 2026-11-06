/**
 * 得意先の名寄せ：依頼文から読み取った「得意先を示す語」と「相手の名前」から候補を返す。
 * AI は「三州きらら精機（三州きらら精機株式会社）」のように括弧つきで返すことがあるので、
 * 括弧・スラッシュでも区切り、いちばん多くの語が当たった得意先を優先する。
 */
import type { Db } from "../db/connection";
import { findCustomer } from "./repo";
import type { Customer } from "./types";

const STOP = /株式会社|有限会社|合同会社|様|御中|さん|担当|です|より/g;
const SPLIT = /[\s　、。,，（）()［］\[\]「」【】／\/・:：]+/;

function byText(db: Db, text: string | null | undefined): Customer[] {
  const hint = (text ?? "").trim();
  if (!hint) return [];
  const direct = findCustomer(db, hint);
  if (direct.length) return direct;
  // 「みどり食品の高橋です」のような文は語に分けて探す（「の」は社名にも入るので、区切りとしてだけ試す）
  const tokens = new Set<string>();
  for (const t of hint.replace(STOP, " ").split(SPLIT)) {
    if (t.length >= 2) tokens.add(t);
    for (const u of t.split("の")) if (u.length >= 2) tokens.add(u);
  }
  const score = new Map<number, { c: Customer; n: number }>();
  for (const t of tokens) for (const c of findCustomer(db, t)) score.set(c.id, { c, n: (score.get(c.id)?.n ?? 0) + 1 });
  const max = Math.max(0, ...[...score.values()].map((s) => s.n));
  return [...score.values()].filter((s) => s.n === max).map((s) => s.c);
}

export function matchCustomerCandidates(db: Db, hint: string | null | undefined, contactName?: string | null): Customer[] {
  const byHint = byText(db, hint);
  if (byHint.length === 1) return byHint;
  const byContact = byText(db, contactName);
  // 社名で複数に割れたら、相手の名前で絞る
  if (byHint.length > 1 && byContact.length) {
    const both = byHint.filter((c) => byContact.some((x) => x.id === c.id));
    if (both.length) return both;
  }
  return byHint.length ? byHint : byContact;
}
