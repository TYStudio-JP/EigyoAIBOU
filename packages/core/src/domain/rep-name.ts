/**
 * 営業担当の表記「営業一課 山田 太郎」から、文面で名乗るときの姓「山田」を取り出す。
 * 「〜部」「〜課」など部署らしい語は飛ばす。空白が無い「山田太郎」は切り出せないのでそのまま返す。
 * 純粋関数なのでブラウザ側（@eigyo/core/shared）からも使える。
 */
const DEPT = /(部|課|係|室|グループ|チーム|営業所|支店|本部|担当)$/;

function nameParts(salesRep: string): { parts: string[]; names: string[] } {
  const parts = salesRep.split(/[\s　]+/).filter(Boolean);
  return { parts, names: parts.filter((p) => !DEPT.test(p)) };
}

/** 名乗り用の姓。「営業一課 山田 太郎」→「山田」 */
export function repSurname(salesRep: string): string {
  const { parts, names } = nameParts(salesRep);
  if (parts.length === 0) return salesRep;
  return names[0] ?? parts[parts.length - 1];
}

/** 署名用の氏名（部署を除く）。「営業一課 山田 太郎」→「山田 太郎」 */
export function repFullName(salesRep: string): string {
  const { parts, names } = nameParts(salesRep);
  return (names.length ? names : parts).join(" ");
}
