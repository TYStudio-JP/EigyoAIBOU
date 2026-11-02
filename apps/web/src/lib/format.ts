export const yen = (n: number | null | undefined, digits = 0): string =>
  n == null ? "-" : `¥${Number(n).toLocaleString("ja-JP", { maximumFractionDigits: digits })}`;
export const pct = (n: number | null | undefined, digits = 1): string => (n == null ? "-" : `${Number(n).toFixed(digits)}%`);
export const num = (n: number | null | undefined): string => (n == null ? "-" : Number(n).toLocaleString("ja-JP"));
export const dateJp = (iso: string | null | undefined): string => {
  if (!iso) return "-";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${y}/${m}/${d}`;
};
export const todayIso = (): string => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
