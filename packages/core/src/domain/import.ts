/**
 * マスタの CSV 取り込み（得意先・仕入れ先・商品・仕入れ価格・売上実績）。
 * 会社ごとに列名が違うので、列の対応（例「得意先CD」→ code）を保存して次回から自動で当てる。
 * 既存データは消さない：コードが一致すれば更新、無ければ追加。削除は人がする。
 */
import type { Db } from "../db/connection";
import { addSupplierPrice, createQuote, findProducts, getRawSetting, listCustomers, listProducts, listSuppliers, listUsers, setRawSetting, today, upsertCustomer, upsertProduct, upsertSupplier, type NewQuoteItem } from "./repo";
import type { CustomerKind, PricingMode, RouteType } from "./types";

export type ImportKind = "customers" | "suppliers" | "products" | "supplier_prices" | "sales";
export const IMPORT_KIND_LABEL: Record<ImportKind, string> = {
  customers: "得意先マスタ", suppliers: "仕入れ先マスタ", products: "商品マスタ", supplier_prices: "仕入れ価格表", sales: "売上・受注実績",
};
export interface ImportField { key: string; label: string; required?: boolean; synonyms: string[]; hint?: string }

const F = (key: string, label: string, synonyms: string[], required = false, hint?: string): ImportField => ({ key, label, synonyms, required, hint });
export const IMPORT_FIELDS: Record<ImportKind, ImportField[]> = {
  customers: [
    F("code", "得意先コード", ["得意先コード", "得意先cd", "得意先ｺｰﾄﾞ", "取引先コード", "顧客コード", "customer_code", "code", "cd"], true),
    F("name", "社名", ["得意先名", "取引先名", "顧客名", "社名", "会社名", "name", "customer_name"], true),
    F("short_name", "略称", ["略称", "得意先略称", "短縮名", "short_name"]),
    F("industry", "業種", ["業種", "業界", "industry"], false, "横展開の同業判定に使います"),
    F("prefecture", "都道府県", ["都道府県", "県", "地域", "prefecture"]),
    F("owner", "自社の営業担当", ["営業担当", "営業担当者", "担当営業", "自社担当", "owner"], false, "ユーザー名と一致すれば担当に設定します"),
    F("contact_name", "担当者名", ["担当者", "担当者名", "先方担当", "contact", "contact_name"]),
    F("contact_email", "担当者メール", ["メール", "email", "e-mail", "mail", "contact_email"]),
    F("tel", "電話", ["電話", "電話番号", "tel", "phone"]),
    F("payment_terms", "支払条件", ["支払条件", "支払い条件", "回収条件", "payment_terms"]),
    F("kind", "区分（エンドユーザー／ディーラー）", ["区分", "顧客区分", "kind", "type"]),
    F("notes", "メモ", ["備考", "メモ", "notes", "remarks"]),
    F("markup_rate", "掛率", ["掛率", "掛け率", "markup", "markup_rate"], false, "設定すると値付けモードが「掛率」になります"),
    F("margin_pct", "粗利率%", ["粗利率", "粗利", "margin", "margin_pct"], false, "設定すると値付けモードが「粗利率」になります"),
    F("rounding_unit", "端数単位", ["端数", "端数単位", "丸め", "rounding_unit"]),
  ],
  suppliers: [
    F("code", "仕入れ先コード", ["仕入先コード", "仕入れ先コード", "仕入先cd", "仕入先ｺｰﾄﾞ", "supplier_code", "code", "cd"], true),
    F("name", "仕入れ先名", ["仕入先名", "仕入れ先名", "社名", "会社名", "name", "supplier_name"], true),
    F("route_type", "ルート（メーカー直／代理店／商社）", ["ルート", "区分", "仕入区分", "route", "route_type"]),
    F("lead_time_days", "リードタイム（日）", ["リードタイム", "納期", "標準納期", "lead_time", "lead_time_days"]),
    F("contact_email", "メール", ["メール", "email", "e-mail", "contact_email"]),
    F("markup_rate", "標準掛率", ["掛率", "標準掛率", "markup", "markup_rate"]),
  ],
  products: [
    F("code", "商品コード", ["商品コード", "商品cd", "商品ｺｰﾄﾞ", "自社コード", "品目コード", "product_code", "code", "cd"], true),
    F("part_number", "品番（メーカー型番）", ["品番", "型番", "型式", "メーカー品番", "part_number", "model"], true),
    F("name", "商品名", ["商品名", "品名", "name", "product_name"], true),
    F("maker", "メーカー", ["メーカー", "メーカー名", "製造元", "maker", "manufacturer"]),
    F("category", "カテゴリ", ["カテゴリ", "分類", "商品分類", "大分類", "category"], false, "空なら「未分類」。横展開の判定に使います"),
    F("unit", "単位", ["単位", "unit"]),
    F("list_price", "定価", ["定価", "標準価格", "上代", "list_price", "price"]),
    F("spec", "仕様", ["仕様", "規格", "サイズ", "spec"]),
  ],
  supplier_prices: [
    F("product_code", "商品コード", ["商品コード", "商品cd", "自社コード", "product_code", "code"], true),
    F("supplier_code", "仕入れ先コード", ["仕入先コード", "仕入れ先コード", "仕入先cd", "supplier_code"], true),
    F("cost", "仕入れ単価", ["仕入単価", "仕入れ単価", "仕入価格", "原価", "cost", "unit_cost"], true),
    F("min_lot", "最小ロット", ["最小ロット", "最低数量", "ロット", "min_lot", "moq"]),
    F("lead_time_days", "納期（日）", ["納期", "リードタイム", "lead_time", "lead_time_days"]),
    F("valid_from", "適用日", ["適用日", "適用開始日", "改定日", "valid_from", "date"]),
  ],
  sales: [
    F("customer_code", "得意先コード", ["得意先コード", "得意先cd", "取引先コード", "customer_code"], true),
    F("product_code", "商品コード", ["商品コード", "商品cd", "自社コード", "product_code"], true),
    F("qty", "数量", ["数量", "数", "qty", "quantity"], true),
    F("unit_price", "売単価", ["売単価", "単価", "売価", "販売単価", "unit_price", "price"], true),
    F("date", "日付", ["日付", "売上日", "受注日", "納品日", "伝票日付", "date"], true),
    F("cost", "仕入れ単価", ["仕入単価", "仕入れ単価", "原価", "cost"]),
    F("supplier_code", "仕入れ先コード", ["仕入先コード", "仕入れ先コード", "仕入先cd", "仕入れ先cd", "supplier_code"]),
    F("subject", "件名", ["件名", "案件名", "subject", "title"]),
    F("quote_no", "伝票番号・見積番号", ["伝票番号", "受注番号", "見積番号", "no", "slip_no"], false, "同じ番号の行は 1 つの見積りにまとめます"),
  ],
};

/** 文字コードを判定して文字列にする（UTF-8 BOM / UTF-8 / Shift_JIS）。 */
export function decodeCsv(buf: Buffer): string {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.subarray(3).toString("utf8");
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); } catch { /* not utf-8 */ }
  try { return new TextDecoder("shift_jis").decode(buf); } catch { return buf.toString("utf8"); }
}

/** RFC 4180 相当の CSV パーサ（引用符・改行・タブ区切りに対応）。 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  const delim = text.split("\n")[0]?.includes("\t") && !text.split("\n")[0]?.includes(",") ? "\t" : ",";
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ""; }
    else if (ch === "\r") { /* skip */ }
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const norm = (s: string) => s.toLowerCase().replace(/[\s　_\-・()（）]/g, "").replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));

/** 列名から自動で対応を当てる。保存済みの対応があればそれを優先。 */
export function autoMap(headers: string[], kind: ImportKind, saved: Record<string, string> | null = null): Record<string, string> {
  const map: Record<string, string> = {};
  const hs = headers.map(norm);
  for (const f of IMPORT_FIELDS[kind]) {
    const savedHeader = saved?.[f.key];
    if (savedHeader && headers.includes(savedHeader)) { map[f.key] = savedHeader; continue; }
    const idx = hs.findIndex((h) => f.synonyms.some((syn) => h === norm(syn))) ;
    const idx2 = idx >= 0 ? idx : hs.findIndex((h) => f.synonyms.some((syn) => h.includes(norm(syn)) && norm(syn).length >= 2));
    if (idx2 >= 0 && !Object.values(map).includes(headers[idx2])) map[f.key] = headers[idx2];
  }
  return map;
}

export const importMapKey = (kind: ImportKind) => `import_map_${kind}`;
export function loadImportMap(db: Db, kind: ImportKind): Record<string, string> | null {
  const raw = getRawSetting(db, importMapKey(kind));
  if (!raw) return null;
  try { return JSON.parse(raw) as Record<string, string>; } catch { return null; }
}
export function saveImportMap(db: Db, kind: ImportKind, map: Record<string, string>): void {
  setRawSetting(db, importMapKey(kind), JSON.stringify(map));
}

export interface ImportPreview { kind: ImportKind; headers: string[]; sample: string[][]; total: number; mapping: Record<string, string>; fields: ImportField[]; missing_required: string[] }
export function previewImport(db: Db, buf: Buffer, kind: ImportKind): ImportPreview {
  const rows = parseCsv(decodeCsv(buf));
  const headers = (rows[0] ?? []).map((h) => h.trim());
  const mapping = autoMap(headers, kind, loadImportMap(db, kind));
  const missing = IMPORT_FIELDS[kind].filter((f) => f.required && !mapping[f.key]).map((f) => f.label);
  return { kind, headers, sample: rows.slice(1, 6), total: Math.max(0, rows.length - 1), mapping, fields: IMPORT_FIELDS[kind], missing_required: missing };
}

/** 数値セル。空欄は null（Number("") は 0 になるので先に弾く。空欄で既存値を 0 に上書きしない）。 */
const num = (v: string | undefined): number | null => { if (v == null) return null; const s = String(v).replace(/[,，円¥\s　]/g, ""); if (s === "") return null; const n = Number(s); return Number.isFinite(n) ? n : null; };
const dateIso = (v: string | undefined): string | null => {
  if (!v) return null;
  const s = v.trim().replace(/[年月]/g, "/").replace(/日/g, "");
  const m = s.match(/^(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})/) ?? s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
};
const routeOf = (v: string | undefined): RouteType => {
  const s = (v ?? "").toLowerCase();
  if (/代理|agency|dealer|販売店/.test(s)) return "agency";
  if (/商社|trading|問屋|卸/.test(s)) return "trading";
  return "maker";
};
const kindOf = (v: string | undefined): CustomerKind => (/ディーラー|商社|販売店|dealer/.test((v ?? "").toLowerCase()) ? "dealer" : "end_user");

export interface ImportResult { kind: ImportKind; total: number; inserted: number; updated: number; skipped: number; errors: string[]; /** 売上実績で作った受注見積りの ID（案件へのまとめ直しに使う） */ quote_ids?: number[] }

/** 列の対応に従って取り込む。既存はコード一致で更新、無ければ追加。失敗行は理由付きで返す（他の行は取り込む）。 */
export function commitImport(db: Db, buf: Buffer, kind: ImportKind, mapping: Record<string, string>): ImportResult {
  const rows = parseCsv(decodeCsv(buf));
  const headers = (rows[0] ?? []).map((h) => h.trim());
  const col = (r: string[], key: string): string | undefined => { const h = mapping[key]; if (!h) return undefined; const i = headers.indexOf(h); return i >= 0 ? r[i]?.trim() : undefined; };
  const missing = IMPORT_FIELDS[kind].filter((f) => f.required && !mapping[f.key]);
  if (missing.length) throw new Error(`必須の列が未対応です：${missing.map((f) => f.label).join("、")}`);
  saveImportMap(db, kind, mapping);
  const res: ImportResult = { kind, total: rows.length - 1, inserted: 0, updated: 0, skipped: 0, errors: [] };
  const body = rows.slice(1);

  // 列が対応付けられていない項目は、既存の値を保つ（取り込みで情報を消さない）
  const mapped = (key: string) => Boolean(mapping[key]);
  const keep = <T,>(key: string, v: T, prev: T | undefined, fallback: T): T => (mapped(key) && v !== undefined && v !== null && v !== "" ? v : prev !== undefined ? prev : fallback);

  if (kind === "customers") {
    const byCode = new Map(listCustomers(db).map((c) => [c.code, c]));
    // 自社の営業担当：氏名（空白は無視）か、ひとりに決まる姓でユーザーに当てる
    const squash = (s: string) => s.replace(/[\s　]/g, "");
    const users = listUsers(db);
    const ownerOf = (v: string | undefined): number | null | undefined => {
      const k = squash(v ?? "");
      if (!k) return undefined;
      const full = users.find((u) => squash(u.name) === k);
      if (full) return full.id;
      const bySurname = users.filter((u) => u.name.split(/[\s　]+/)[0] === k);
      return bySurname.length === 1 ? bySurname[0].id : null;
    };
    body.forEach((r, i) => {
      const code = col(r, "code"), name = col(r, "name");
      if (!code || !name) { res.skipped++; res.errors.push(`${i + 2} 行目：得意先コードまたは社名が空`); return; }
      const prev = byCode.get(code);
      const owner = ownerOf(col(r, "owner"));
      if (owner === null) res.errors.push(`${i + 2} 行目：営業担当「${col(r, "owner")}」がユーザーに見つかりません（担当は変更していません）`);
      const markup = num(col(r, "markup_rate")), margin = num(col(r, "margin_pct"));
      const mode: PricingMode | undefined = markup ? "markup" : margin ? "margin" : undefined;
      const shortDefault = name.replace(/株式会社|有限会社|合同会社/g, "").trim() || name;
      const row = upsertCustomer(db, {
        code, name,
        short_name: keep("short_name", col(r, "short_name"), prev?.short_name, shortDefault)!,
        industry: keep("industry", col(r, "industry"), prev?.industry, "未設定")!,
        prefecture: keep("prefecture", col(r, "prefecture"), prev?.prefecture, "")!,
        contact_name: keep("contact_name", col(r, "contact_name") || null, prev?.contact_name, null),
        contact_email: keep("contact_email", col(r, "contact_email") || null, prev?.contact_email, null),
        tel: keep("tel", col(r, "tel") || null, prev?.tel, null),
        kind: mapped("kind") && col(r, "kind") ? kindOf(col(r, "kind")) : prev?.kind ?? "end_user",
        payment_terms: keep("payment_terms", col(r, "payment_terms"), prev?.payment_terms, "月末締め翌月末払い")!,
        notes: keep("notes", col(r, "notes"), prev?.notes, "")!,
        ...(owner ? { owner_user_id: owner } : {}),
        ...(mode ? { pricing_mode: mode, markup_rate: markup, margin_pct: margin } : {}), ...(num(col(r, "rounding_unit")) ? { rounding_unit: num(col(r, "rounding_unit"))! } : {}),
      });
      prev ? res.updated++ : res.inserted++; byCode.set(code, row);
    });
  } else if (kind === "suppliers") {
    const byCode = new Map(listSuppliers(db).map((s) => [s.code, s]));
    body.forEach((r, i) => {
      const code = col(r, "code"), name = col(r, "name");
      if (!code || !name) { res.skipped++; res.errors.push(`${i + 2} 行目：仕入れ先コードまたは名称が空`); return; }
      const prev = byCode.get(code);
      const row = upsertSupplier(db, {
        code, name,
        route_type: mapped("route_type") && col(r, "route_type") ? routeOf(col(r, "route_type")) : prev?.route_type ?? "maker",
        lead_time_days: keep("lead_time_days", num(col(r, "lead_time_days")), prev?.lead_time_days, 5)!,
        contact_email: keep("contact_email", col(r, "contact_email") || null, prev?.contact_email, null),
        markup_rate: num(col(r, "markup_rate")),
      });
      prev ? res.updated++ : res.inserted++; byCode.set(code, row);
    });
  } else if (kind === "products") {
    const byCode = new Map(listProducts(db).map((p) => [p.code, p]));
    body.forEach((r, i) => {
      const code = col(r, "code"), name = col(r, "name");
      if (!code || !name) { res.skipped++; res.errors.push(`${i + 2} 行目：商品コードまたは商品名が空`); return; }
      const prev = byCode.get(code);
      const row = upsertProduct(db, {
        code, name,
        part_number: keep("part_number", col(r, "part_number"), prev?.part_number, code)!,
        maker: keep("maker", col(r, "maker"), prev?.maker, "")!,
        category: keep("category", col(r, "category"), prev?.category, "未分類")!,
        unit: keep("unit", col(r, "unit"), prev?.unit, "個")!,
        list_price: keep("list_price", num(col(r, "list_price")), prev?.list_price, 0)!,
        spec: keep("spec", col(r, "spec"), prev?.spec, "")!,
      });
      prev ? res.updated++ : res.inserted++; byCode.set(code, row);
    });
  } else if (kind === "supplier_prices") {
    const products = new Map(listProducts(db).map((p) => [p.code, p.id]));
    const suppliers = new Map(listSuppliers(db).map((s) => [s.code, s.id]));
    body.forEach((r, i) => {
      const pid = products.get(col(r, "product_code") ?? ""), sid = suppliers.get(col(r, "supplier_code") ?? ""), cost = num(col(r, "cost"));
      if (!pid || !sid || cost == null) { res.skipped++; res.errors.push(`${i + 2} 行目：${!pid ? "商品コード" : !sid ? "仕入れ先コード" : "仕入れ単価"}が見つかりません`); return; }
      addSupplierPrice(db, { product_id: pid, supplier_id: sid, cost, min_lot: num(col(r, "min_lot")) ?? 1, lead_time_days: num(col(r, "lead_time_days")), valid_from: dateIso(col(r, "valid_from")) ?? today() });
      res.inserted++;
    });
  } else if (kind === "sales") {
    const customers = new Map(listCustomers(db).map((c) => [c.code, c.id]));
    const products = new Map(listProducts(db).map((p) => [p.code, p]));
    const suppliers = new Map(listSuppliers(db).map((s) => [s.code, s.id]));
    // 同じ得意先×日付（または伝票番号）を 1 つの受注見積りにまとめる
    const groups = new Map<string, { customer_id: number; date: string; subject: string; items: NewQuoteItem[]; lines: number[] }>();
    body.forEach((r, i) => {
      const cid = customers.get(col(r, "customer_code") ?? ""); const p = products.get(col(r, "product_code") ?? "");
      const qty = num(col(r, "qty")), price = num(col(r, "unit_price")), date = dateIso(col(r, "date"));
      if (!cid || !p || qty == null || price == null || !date) { res.skipped++; res.errors.push(`${i + 2} 行目：${!cid ? "得意先コード" : !p ? "商品コード" : !date ? "日付" : "数量・単価"}が不正`); return; }
      const key = `${cid}|${col(r, "quote_no") || date}`;
      const g = groups.get(key) ?? { customer_id: cid, date, subject: col(r, "subject") || `${date.slice(0, 7).replace("-", "年")}月 売上実績（取り込み）`, items: [], lines: [] };
      g.items.push({ product_id: p.id, description: `${p.name}（${p.part_number}）`, qty, unit: p.unit, unit_price: price, cost: num(col(r, "cost")) ?? 0, supplier_id: suppliers.get(col(r, "supplier_code") ?? "") ?? null });
      g.lines.push(i + 2); groups.set(key, g);
    });
    for (const g of groups.values()) {
      const at = `${g.date} 12:00:00`;
      const q = createQuote(db, { customer_id: g.customer_id, subject: g.subject, status: "won", source_type: "import", source_text: `CSV 取り込み（${g.lines.length} 行）`, items: g.items, created_at: at, submitted_at: at, closed_at: at, valid_until: null, promised_delivery: null });
      (res.quote_ids ??= []).push(q.id);
      res.inserted++;
    }
  }
  return res;
}

/** 商品コードが無い売上データ向け：品番・品名で商品を探す補助（画面のヒント用）。 */
export function guessProduct(db: Db, text: string) { return findProducts(db, text, 3); }
