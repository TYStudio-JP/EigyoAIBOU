import type { Db } from "../db/connection";
import {
  DEFAULT_SETTINGS,
  type Contact, type ContactStatus, type CustomerKind, type CustomerOwnerRecord, type Deal, type DealEvent, type DealStatus, type DealWithRefs, type EndCustomer, type User,
  type Activity,
  type Customer,
  type LostReason,
  type Product,
  type Quote,
  type QuoteItem,
  type QuoteStatus,
  type QuoteWithItems,
  type Settings,
  type Supplier,
  type SupplierPrice,
} from "./types";

type Row = Record<string, unknown>;
// node:sqlite は prototype のないオブジェクトを返すため、React Server Components に渡せるよう plain object に詰め替える。
const plain = <T>(row: unknown): T => ({ ...(row as Record<string, unknown>) }) as T;
const all = <T>(db: Db, sql: string, ...params: (string | number | null)[]): T[] =>
  (db.prepare(sql).all(...params) as unknown[]).map((r) => plain<T>(r));
const one = <T>(db: Db, sql: string, ...params: (string | number | null)[]): T | null => {
  const r = db.prepare(sql).get(...params);
  return r === undefined ? null : plain<T>(r);
};

export function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function nowStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${today()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
export function addDays(iso: string, days: number): string {
  const d = new Date(iso.slice(0, 10) + "T00:00:00");
  d.setDate(d.getDate() + days);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function daysBetween(fromIso: string, toIso: string = today()): number {
  const a = new Date(fromIso.slice(0, 10) + "T00:00:00").getTime();
  const b = new Date(toIso.slice(0, 10) + "T00:00:00").getTime();
  return Math.round((b - a) / 86_400_000);
}

// ---------- settings ----------
export function getSettings(db: Db): Settings {
  const rows = all<{ key: string; value: string }>(db, "SELECT key, value FROM settings");
  const s: Record<string, unknown> = { ...(DEFAULT_SETTINGS as unknown as Record<string, unknown>) };
  for (const r of rows) {
    const def = (DEFAULT_SETTINGS as unknown as Record<string, unknown>)[r.key];
    s[r.key] = typeof def === "number" ? Number(r.value) : r.value;
  }
  return s as unknown as Settings;
}
export function saveSettings(db: Db, patch: Partial<Settings>): Settings {
  const stmt = db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) stmt.run(k, String(v));
  return getSettings(db);
}

// ---------- customers ----------
export function listCustomers(db: Db): Customer[] {
  return all<Customer>(db, "SELECT * FROM customers ORDER BY code");
}
export function getCustomer(db: Db, id: number): Customer | null {
  return one<Customer>(db, "SELECT * FROM customers WHERE id=?", id);
}
export function findCustomer(db: Db, q: string): Customer[] {
  const like = `%${q.trim()}%`;
  return all<Customer>(
    db,
    "SELECT * FROM customers WHERE code LIKE ? OR name LIKE ? OR short_name LIKE ? OR contact_name LIKE ? ORDER BY code LIMIT 20",
    like, like, like, like,
  );
}
/** 電話番号で得意先を探す（ハイフン・空白・国番号の違いを吸収）。 */
export function normalizeTel(tel: string): string {
  let t = tel.replace(/[^\d+]/g, "");
  if (t.startsWith("+81")) t = "0" + t.slice(3);
  return t.replace(/\D/g, "");
}
export function findCustomerByTel(db: Db, tel: string): Customer | null {
  const n = normalizeTel(tel);
  if (!n) return null;
  return listCustomers(db).find((c) => c.tel && normalizeTel(c.tel) === n) ?? null;
}
type PricingFields = Pick<Customer, "pricing_mode" | "markup_rate" | "margin_pct" | "rounding_unit">;
export function upsertCustomer(db: Db, c: Omit<Customer, "id" | "kind" | "owner_user_id" | keyof PricingFields> & { kind?: CustomerKind; owner_user_id?: number | null } & Partial<PricingFields>): Customer {
  // 値付けルールは指定があるときだけ更新（マスタ取り込みで既存の設定を消さない）
  const mode = c.pricing_mode ?? null, rate = c.markup_rate ?? null, mp = c.margin_pct ?? null, ru = c.rounding_unit ?? null;
  db.prepare(
    `INSERT INTO customers(code,name,short_name,industry,prefecture,contact_name,contact_email,tel,kind,owner_user_id,payment_terms,notes,pricing_mode,markup_rate,margin_pct,rounding_unit)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,COALESCE(?,'none'),?,?,COALESCE(?,1))
     ON CONFLICT(code) DO UPDATE SET name=excluded.name, short_name=excluded.short_name, industry=excluded.industry,
       prefecture=excluded.prefecture, contact_name=excluded.contact_name, contact_email=excluded.contact_email,
       tel=excluded.tel, kind=excluded.kind, owner_user_id=COALESCE(excluded.owner_user_id, customers.owner_user_id), payment_terms=excluded.payment_terms, notes=excluded.notes,
       pricing_mode=COALESCE(?, customers.pricing_mode), markup_rate=COALESCE(?, customers.markup_rate), margin_pct=COALESCE(?, customers.margin_pct), rounding_unit=COALESCE(?, customers.rounding_unit)`,
  ).run(c.code, c.name, c.short_name, c.industry, c.prefecture, c.contact_name, c.contact_email, c.tel ?? null, c.kind ?? "end_user", c.owner_user_id ?? null, c.payment_terms, c.notes, mode, rate, mp, ru, mode, rate, mp, ru);
  return one<Customer>(db, "SELECT * FROM customers WHERE code=?", c.code)!;
}
/** 得意先の属性（値付けルール・メモなど）を部分更新する。 */
export function updateCustomer(db: Db, id: number, patch: Partial<Pick<Customer, "notes" | "contact_name" | "contact_email" | "tel" | "kind" | "payment_terms" | "industry" | keyof PricingFields>>): Customer {
  const keys = Object.keys(patch) as (keyof typeof patch)[];
  if (keys.length) db.prepare(`UPDATE customers SET ${keys.map((k) => `${k}=?`).join(", ")} WHERE id=?`).run(...keys.map((k) => patch[k] as string | number | null), id);
  return getCustomer(db, id)!;
}

// ---------- suppliers ----------
export function listSuppliers(db: Db): Supplier[] {
  return all<Supplier>(db, "SELECT * FROM suppliers ORDER BY code");
}
export function getSupplier(db: Db, id: number): Supplier | null {
  return one<Supplier>(db, "SELECT * FROM suppliers WHERE id=?", id);
}
export function upsertSupplier(db: Db, s: Omit<Supplier, "id" | "markup_rate"> & { markup_rate?: number | null }): Supplier {
  db.prepare(
    `INSERT INTO suppliers(code,name,route_type,lead_time_days,contact_email,markup_rate) VALUES(?,?,?,?,?,?)
     ON CONFLICT(code) DO UPDATE SET name=excluded.name, route_type=excluded.route_type,
       lead_time_days=excluded.lead_time_days, contact_email=excluded.contact_email, markup_rate=COALESCE(?, suppliers.markup_rate)`,
  ).run(s.code, s.name, s.route_type, s.lead_time_days, s.contact_email, s.markup_rate ?? null, s.markup_rate ?? null);
  return one<Supplier>(db, "SELECT * FROM suppliers WHERE code=?", s.code)!;
}
export function updateSupplier(db: Db, id: number, patch: Partial<Pick<Supplier, "name" | "lead_time_days" | "contact_email" | "markup_rate">>): Supplier {
  const keys = Object.keys(patch) as (keyof typeof patch)[];
  if (keys.length) db.prepare(`UPDATE suppliers SET ${keys.map((k) => `${k}=?`).join(", ")} WHERE id=?`).run(...keys.map((k) => patch[k] as string | number | null), id);
  return getSupplier(db, id)!;
}

// ---------- products ----------
export function listProducts(db: Db): Product[] {
  return all<Product>(db, "SELECT * FROM products ORDER BY category, code");
}
export function getProduct(db: Db, id: number): Product | null {
  return one<Product>(db, "SELECT * FROM products WHERE id=?", id);
}
/** 商品コード・品番・商品名・メーカー名で曖昧検索。品番は記号を無視して比較する。 */
export function findProducts(db: Db, q: string, limit = 10): Product[] {
  const raw = q.trim();
  if (!raw) return [];
  const norm = raw.replace(/[\s\-_/.]/g, "").toLowerCase();
  const like = `%${raw}%`;
  const rows = all<Product>(
    db,
    `SELECT * FROM products
     WHERE code LIKE ? OR part_number LIKE ? OR name LIKE ? OR maker LIKE ? OR spec LIKE ?
        OR LOWER(REPLACE(REPLACE(REPLACE(REPLACE(part_number,'-',''),'_',''),'/',''),' ','')) LIKE ?
     LIMIT ?`,
    like, like, like, like, like, `%${norm}%`, limit,
  );
  if (rows.length) return rows;
  // トークン一致（「軍手 M」「テープ 50mm」など）。全語一致→先頭から語を減らして段階的に緩める
  const tokens = raw.replace(/[（）()×xX]/g, " ").split(/\s+/).filter(Boolean);
  for (let k = tokens.length; k >= 1; k--) {
    const sub = tokens.slice(0, k);
    if (k === 1 && sub[0].length < 2) break;
    const where = sub.map(() => "(name LIKE ? OR spec LIKE ? OR part_number LIKE ? OR maker LIKE ?)").join(" AND ");
    const params = sub.flatMap((t) => [`%${t}%`, `%${t}%`, `%${t}%`, `%${t}%`]);
    const hit = all<Product>(db, `SELECT * FROM products WHERE ${where} LIMIT ?`, ...params, limit);
    if (hit.length) return hit;
  }
  return [];
}
export function upsertProduct(db: Db, p: Omit<Product, "id">): Product {
  db.prepare(
    `INSERT INTO products(code,part_number,name,maker,category,unit,list_price,spec) VALUES(?,?,?,?,?,?,?,?)
     ON CONFLICT(code) DO UPDATE SET part_number=excluded.part_number, name=excluded.name, maker=excluded.maker,
       category=excluded.category, unit=excluded.unit, list_price=excluded.list_price, spec=excluded.spec`,
  ).run(p.code, p.part_number, p.name, p.maker, p.category, p.unit, p.list_price, p.spec);
  return one<Product>(db, "SELECT * FROM products WHERE code=?", p.code)!;
}

// ---------- supplier prices ----------
/** 商品ごとの「現在有効な」仕入れ単価（仕入れ先ごとに最新の valid_from）。 */
export function currentSupplierPrices(db: Db, productId: number, asOf: string = today()): SupplierPrice[] {
  return all<SupplierPrice>(
    db,
    `SELECT sp.*, s.name AS supplier_name, s.route_type
     FROM supplier_prices sp
     JOIN suppliers s ON s.id = sp.supplier_id
     WHERE sp.product_id = ? AND sp.valid_from <= ?
       AND sp.valid_from = (SELECT MAX(valid_from) FROM supplier_prices x
                            WHERE x.product_id = sp.product_id AND x.supplier_id = sp.supplier_id AND x.valid_from <= ?)
     ORDER BY sp.cost ASC`,
    productId, asOf, asOf,
  );
}
export function addSupplierPrice(db: Db, sp: Omit<SupplierPrice, "id" | "supplier_name" | "route_type">): void {
  db.prepare(
    `INSERT INTO supplier_prices(product_id,supplier_id,cost,min_lot,lead_time_days,valid_from) VALUES(?,?,?,?,?,?)
     ON CONFLICT(product_id,supplier_id,valid_from) DO UPDATE SET cost=excluded.cost, min_lot=excluded.min_lot, lead_time_days=excluded.lead_time_days`,
  ).run(sp.product_id, sp.supplier_id, sp.cost, sp.min_lot, sp.lead_time_days, sp.valid_from);
}

// ---------- price history ----------
export interface PriceHistoryRow {
  quote_id: number;
  quote_no: string;
  status: QuoteStatus;
  customer_id: number;
  customer_name: string;
  product_id: number;
  qty: number;
  unit_price: number;
  cost: number;
  supplier_id: number | null;
  supplier_name: string | null;
  date: string; // submitted_at or created_at
}
export function priceHistory(db: Db, productId: number, opts: { customerId?: number; limit?: number; excludeQuoteId?: number } = {}): PriceHistoryRow[] {
  const params: (number | string)[] = [productId];
  let where = "qi.product_id = ? AND q.status IN ('submitted','tracking','won','lost')";
  if (opts.customerId) { where += " AND q.customer_id = ?"; params.push(opts.customerId); }
  if (opts.excludeQuoteId) { where += " AND q.id <> ?"; params.push(opts.excludeQuoteId); }
  params.push(opts.limit ?? 50);
  return all<PriceHistoryRow>(
    db,
    `SELECT q.id AS quote_id, q.quote_no, q.status, q.customer_id, c.short_name AS customer_name,
            qi.product_id, qi.qty, qi.unit_price, qi.cost, qi.supplier_id, s.name AS supplier_name,
            COALESCE(q.submitted_at, q.created_at) AS date
     FROM quote_items qi
     JOIN quotes q ON q.id = qi.quote_id
     JOIN customers c ON c.id = q.customer_id
     LEFT JOIN suppliers s ON s.id = qi.supplier_id
     WHERE ${where}
     ORDER BY date DESC, q.id DESC
     LIMIT ?`,
    ...params,
  );
}

// ---------- quotes ----------
export function nextQuoteNo(db: Db, date: string = today()): string {
  const ym = date.slice(0, 7).replace("-", "");
  const row = one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM quotes WHERE quote_no LIKE ?", `Q${ym}-%`);
  return `Q${ym}-${String((row?.n ?? 0) + 1).padStart(3, "0")}`;
}

export interface NewQuoteItem {
  product_id: number | null;
  description: string;
  qty: number;
  unit: string;
  unit_price: number;
  cost: number;
  supplier_id: number | null;
  supplier_delivery?: string | null;
  remarks?: string;
}
export interface NewQuote {
  customer_id: number;
  contact_id?: number | null;
  deal_id?: number | null;
  subject: string;
  status?: QuoteStatus;
  requested_delivery?: string | null;
  promised_delivery?: string | null;
  valid_until?: string | null;
  source_type?: string;
  source_text?: string;
  notes?: string;
  items: NewQuoteItem[];
  created_at?: string;
  submitted_at?: string | null;
  closed_at?: string | null;
  lost_reason?: LostReason | null;
  lost_detail?: string | null;
}

export function createQuote(db: Db, q: NewQuote): QuoteWithItems {
  const created = q.created_at ?? nowStamp();
  const quoteNo = nextQuoteNo(db, created);
  const settings = getSettings(db);
  const valid_until = q.valid_until === undefined ? addDays(created, settings.quote_valid_days) : q.valid_until;
  // 回答納期の初期値：各明細の仕入れ先リードタイム（＋1日の社内処理）の最大値
  let promised_delivery = q.promised_delivery;
  if (promised_delivery === undefined) {
    const leads = q.items.map((it) => {
      if (!it.product_id || !it.supplier_id) return null;
      const sp = currentSupplierPrices(db, it.product_id, created.slice(0, 10)).find((o) => o.supplier_id === it.supplier_id);
      const sup = getSupplier(db, it.supplier_id);
      return sp?.lead_time_days ?? sup?.lead_time_days ?? null;
    }).filter((n): n is number => n !== null);
    promised_delivery = leads.length ? addDays(created, Math.max(...leads) + 1) : null;
  }
  const res = db.prepare(
    `INSERT INTO quotes(quote_no,customer_id,contact_id,deal_id,subject,status,requested_delivery,promised_delivery,valid_until,source_type,source_text,notes,
       lost_reason,lost_detail,submitted_at,closed_at,created_at,updated_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    quoteNo, q.customer_id, q.contact_id ?? null, q.deal_id ?? null, q.subject, q.status ?? "draft", q.requested_delivery ?? null, promised_delivery ?? null,
    valid_until ?? null, q.source_type ?? "manual", q.source_text ?? "", q.notes ?? "",
    q.lost_reason ?? null, q.lost_detail ?? null, q.submitted_at ?? null, q.closed_at ?? null, created, created,
  );
  const id = Number(res.lastInsertRowid);
  replaceItems(db, id, q.items);
  addActivity(db, id, "created", `見積り ${quoteNo} を作成（${q.source_type ?? "manual"}）`, created);
  return getQuote(db, id)!;
}

export function replaceItems(db: Db, quoteId: number, items: NewQuoteItem[]): void {
  db.prepare("DELETE FROM quote_items WHERE quote_id=?").run(quoteId);
  const ins = db.prepare(
    `INSERT INTO quote_items(quote_id,line_no,product_id,description,qty,unit,unit_price,cost,supplier_id,supplier_delivery,remarks)
     VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
  );
  items.forEach((it, i) =>
    ins.run(quoteId, i + 1, it.product_id, it.description, it.qty, it.unit, it.unit_price, it.cost, it.supplier_id, it.supplier_delivery ?? null, it.remarks ?? ""),
  );
  touch(db, quoteId);
}

export function updateQuoteHeader(db: Db, quoteId: number, patch: Partial<Pick<Quote, "subject" | "requested_delivery" | "promised_delivery" | "valid_until" | "notes" | "customer_id" | "contact_id" | "deal_id">>): void {
  const keys = Object.keys(patch) as (keyof typeof patch)[];
  if (!keys.length) return;
  const set = keys.map((k) => `${k}=?`).join(", ");
  db.prepare(`UPDATE quotes SET ${set}, updated_at=? WHERE id=?`).run(...keys.map((k) => patch[k] as string | number | null), nowStamp(), quoteId);
}

function touch(db: Db, quoteId: number) {
  db.prepare("UPDATE quotes SET updated_at=? WHERE id=?").run(nowStamp(), quoteId);
}

export function setQuoteStatus(
  db: Db,
  quoteId: number,
  status: QuoteStatus,
  opts: { lost_reason?: LostReason | null; lost_detail?: string | null; at?: string; note?: string } = {},
): QuoteWithItems {
  const at = opts.at ?? nowStamp();
  const q = getQuote(db, quoteId);
  if (!q) throw new Error(`quote ${quoteId} not found`);
  const submitted_at = status === "submitted" && !q.submitted_at ? at : q.submitted_at;
  const closed_at = status === "won" || status === "lost" ? at : null;
  db.prepare(
    "UPDATE quotes SET status=?, submitted_at=?, closed_at=?, lost_reason=?, lost_detail=?, updated_at=? WHERE id=?",
  ).run(status, submitted_at, closed_at, status === "lost" ? (opts.lost_reason ?? "other") : null, status === "lost" ? (opts.lost_detail ?? null) : null, at, quoteId);
  const label = { draft: "下書きに戻す", submitted: "提出済", tracking: "追跡中", won: "受注", lost: "失注" }[status];
  addActivity(db, quoteId, "status", `ステータス → ${label}${opts.note ? `：${opts.note}` : ""}`, at);
  return getQuote(db, quoteId)!;
}

export function addActivity(db: Db, quoteId: number, kind: string, body: string, at: string = nowStamp()): Activity {
  const res = db.prepare("INSERT INTO activities(quote_id,kind,body,created_at) VALUES(?,?,?,?)").run(quoteId, kind, body, at);
  return one<Activity>(db, "SELECT * FROM activities WHERE id=?", Number(res.lastInsertRowid))!;
}
export function listActivities(db: Db, quoteId: number): Activity[] {
  return all<Activity>(db, "SELECT * FROM activities WHERE quote_id=? ORDER BY created_at DESC, id DESC", quoteId);
}

export function getQuote(db: Db, id: number): QuoteWithItems | null {
  const q = one<Quote>(db, "SELECT * FROM quotes WHERE id=?", id);
  if (!q) return null;
  return hydrate(db, q);
}
export function getQuoteByNo(db: Db, quoteNo: string): QuoteWithItems | null {
  const q = one<Quote>(db, "SELECT * FROM quotes WHERE quote_no=?", quoteNo);
  return q ? hydrate(db, q) : null;
}
function hydrate(db: Db, q: Quote): QuoteWithItems {
  const customer = getCustomer(db, q.customer_id)!;
  const items = all<QuoteItem>(db, "SELECT * FROM quote_items WHERE quote_id=? ORDER BY line_no", q.id).map((it) => ({
    ...it,
    product: it.product_id ? getProduct(db, it.product_id) : null,
    supplier: it.supplier_id ? getSupplier(db, it.supplier_id) : null,
  }));
  const total = items.reduce((s, it) => s + it.qty * it.unit_price, 0);
  const total_cost = items.reduce((s, it) => s + it.qty * it.cost, 0);
  const margin_pct = total > 0 ? ((total - total_cost) / total) * 100 : 0;
  return { ...q, customer, items, total, total_cost, margin_pct };
}

export interface QuoteSummary extends Quote {
  customer_name: string;
  customer_code: string;
  total: number;
  total_cost: number;
  item_count: number;
  last_followup_at: string | null;
}
export function listQuotes(db: Db, opts: { status?: QuoteStatus[]; customerId?: number; contactId?: number; dealId?: number; q?: string; limit?: number } = {}): QuoteSummary[] {
  const params: (string | number)[] = [];
  const where: string[] = [];
  if (opts.status?.length) { where.push(`q.status IN (${opts.status.map(() => "?").join(",")})`); params.push(...opts.status); }
  if (opts.customerId) { where.push("q.customer_id = ?"); params.push(opts.customerId); }
  if (opts.contactId) { where.push("q.contact_id = ?"); params.push(opts.contactId); }
  if (opts.dealId) { where.push("q.deal_id = ?"); params.push(opts.dealId); }
  if (opts.q) { where.push("(q.quote_no LIKE ? OR q.subject LIKE ? OR c.name LIKE ? OR c.short_name LIKE ?)"); params.push(...Array(4).fill(`%${opts.q}%`)); }
  params.push(opts.limit ?? 200);
  return all<QuoteSummary>(
    db,
    `SELECT q.*, c.short_name AS customer_name, c.code AS customer_code,
            COALESCE((SELECT SUM(qty*unit_price) FROM quote_items WHERE quote_id=q.id),0) AS total,
            COALESCE((SELECT SUM(qty*cost) FROM quote_items WHERE quote_id=q.id),0) AS total_cost,
            (SELECT COUNT(*) FROM quote_items WHERE quote_id=q.id) AS item_count,
            (SELECT MAX(created_at) FROM activities WHERE quote_id=q.id AND kind='followup') AS last_followup_at
     FROM quotes q JOIN customers c ON c.id=q.customer_id
     ${where.length ? "WHERE " + where.join(" AND ") : ""}
     ORDER BY q.updated_at DESC, q.id DESC LIMIT ?`,
    ...params,
  );
}

export function deleteQuote(db: Db, id: number): void {
  db.prepare("DELETE FROM quotes WHERE id=?").run(id);
}

/** 得意先が過去に購入（受注）した商品IDの集合と、カテゴリ集合。 */
export function purchasedProducts(db: Db, customerId: number): { product_id: number; category: string; last_date: string; total_qty: number; last_price: number }[] {
  return all(
    db,
    `SELECT qi.product_id, p.category, MAX(COALESCE(q.submitted_at,q.created_at)) AS last_date, SUM(qi.qty) AS total_qty,
            (SELECT unit_price FROM quote_items x JOIN quotes y ON y.id=x.quote_id WHERE x.product_id=qi.product_id AND y.customer_id=q.customer_id AND y.status='won'
             ORDER BY COALESCE(y.submitted_at,y.created_at) DESC LIMIT 1) AS last_price
     FROM quote_items qi JOIN quotes q ON q.id=qi.quote_id JOIN products p ON p.id=qi.product_id
     WHERE q.customer_id=? AND q.status='won' AND qi.product_id IS NOT NULL
     GROUP BY qi.product_id`,
    customerId,
  );
}

export function dashboardStats(db: Db): { by_status: Record<QuoteStatus, number>; recent_won_amount: number; open_amount: number; win_rate_pct: number } {
  const rows = all<{ status: QuoteStatus; n: number; amt: number }>(
    db,
    `SELECT q.status, COUNT(*) AS n, COALESCE(SUM((SELECT SUM(qty*unit_price) FROM quote_items WHERE quote_id=q.id)),0) AS amt
     FROM quotes q GROUP BY q.status`,
  );
  const by_status = { draft: 0, submitted: 0, tracking: 0, won: 0, lost: 0 } as Record<QuoteStatus, number>;
  let open_amount = 0;
  for (const r of rows) { by_status[r.status] = r.n; if (r.status === "submitted" || r.status === "tracking") open_amount += r.amt; }
  const since = addDays(today(), -30);
  const won = one<{ amt: number }>(
    db,
    `SELECT COALESCE(SUM((SELECT SUM(qty*unit_price) FROM quote_items WHERE quote_id=q.id)),0) AS amt FROM quotes q WHERE status='won' AND substr(closed_at,1,10)>=?`,
    since,
  );
  const closed = by_status.won + by_status.lost;
  return { by_status, recent_won_amount: won?.amt ?? 0, open_amount, win_rate_pct: closed ? (by_status.won / closed) * 100 : 0 };
}

// ---------- calls（電話メモ） ----------
import type { CallDirection, CallMinutes, CallRecord, CallStatus, CallWithCustomer } from "./types";

function hydrateCall(db: Db, c: CallRecord): CallWithCustomer {
  let minutes: CallMinutes | null = null;
  if (c.minutes_json) { try { minutes = JSON.parse(c.minutes_json) as CallMinutes; } catch { minutes = null; } }
  return { ...c, customer: c.customer_id ? getCustomer(db, c.customer_id) : null, contact: c.contact_id ? getContact(db, c.contact_id) : null, minutes };
}
export function createCall(db: Db, c: { customer_id?: number | null; contact_id?: number | null; deal_id?: number | null; tel?: string | null; direction?: CallDirection; started_at?: string; duration_sec?: number | null; source?: string; memo?: string }): CallWithCustomer {
  const now = nowStamp();
  const res = db.prepare(
    "INSERT INTO calls(customer_id,contact_id,deal_id,tel,direction,started_at,duration_sec,source,memo,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
  ).run(c.customer_id ?? null, c.contact_id ?? null, c.deal_id ?? null, c.tel ?? null, c.direction ?? "unknown", c.started_at ?? now, c.duration_sec ?? null, c.source ?? "manual", c.memo ?? "", "open", now, now);
  return getCall(db, Number(res.lastInsertRowid))!;
}
export function getCall(db: Db, id: number): CallWithCustomer | null {
  const c = one<CallRecord>(db, "SELECT * FROM calls WHERE id=?", id);
  return c ? hydrateCall(db, c) : null;
}
export function listCalls(db: Db, opts: { status?: CallStatus[]; customerId?: number; contactId?: number; dealId?: number; limit?: number } = {}): CallWithCustomer[] {
  const params: (string | number)[] = [];
  const where: string[] = [];
  if (opts.status?.length) { where.push(`status IN (${opts.status.map(() => "?").join(",")})`); params.push(...opts.status); }
  if (opts.customerId) { where.push("customer_id=?"); params.push(opts.customerId); }
  if (opts.contactId) { where.push("contact_id=?"); params.push(opts.contactId); }
  if (opts.dealId) { where.push("deal_id=?"); params.push(opts.dealId); }
  params.push(opts.limit ?? 50);
  return all<CallRecord>(db, `SELECT * FROM calls ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY started_at DESC, id DESC LIMIT ?`, ...params).map((c) => hydrateCall(db, c));
}
export function updateCall(db: Db, id: number, patch: Partial<Pick<CallRecord, "customer_id" | "contact_id" | "deal_id" | "tel" | "direction" | "memo" | "minutes_json" | "mail_subject" | "mail_body" | "status" | "duration_sec" | "started_at" | "process_state" | "process_error">>): CallWithCustomer {
  const keys = Object.keys(patch) as (keyof typeof patch)[];
  if (keys.length) {
    const set = keys.map((k) => `${k}=?`).join(", ");
    db.prepare(`UPDATE calls SET ${set}, updated_at=? WHERE id=?`).run(...keys.map((k) => patch[k] as string | number | null), nowStamp(), id);
  }
  return getCall(db, id)!;
}
export function deleteCall(db: Db, id: number): void {
  db.prepare("DELETE FROM calls WHERE id=?").run(id);
}

// ---------- contacts（得意先の担当者） ----------
export function listContacts(db: Db, customerId?: number, opts: { includeInactive?: boolean } = {}): Contact[] {
  const where: string[] = [];
  const params: (number | string)[] = [];
  if (customerId) { where.push("customer_id=?"); params.push(customerId); }
  if (!opts.includeInactive) where.push("status='active'");
  return all<Contact>(db, `SELECT * FROM contacts ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'transferred' THEN 1 ELSE 2 END, id`, ...params);
}
export function getContact(db: Db, id: number): Contact | null {
  return one<Contact>(db, "SELECT * FROM contacts WHERE id=?", id);
}
/** 「佐藤さん」「佐藤 健一」など、名前の一部で得意先内の担当者を探す（在籍者優先）。 */
export function findContactByName(db: Db, customerId: number, name: string): Contact | null {
  const key = name.replace(/(さん|様|氏|部長|課長|主任|係長|社長|専務|常務|工場長)$/g, "").replace(/\s+/g, "").trim();
  if (!key) return null;
  const list = listContacts(db, customerId, { includeInactive: true });
  const norm = (s: string) => s.replace(/\s+/g, "");
  return list.find((c) => norm(c.name) === key) ?? list.find((c) => norm(c.name).includes(key) || key.includes(norm(c.name).slice(0, 2))) ?? null;
}
export function createContact(db: Db, c: { customer_id: number; name: string; department?: string; title?: string; tel?: string | null; mobile?: string | null; email?: string | null; status?: ContactStatus; notes?: string; source?: string }): Contact {
  const now = nowStamp();
  const res = db.prepare(
    "INSERT INTO contacts(customer_id,name,department,title,tel,mobile,email,status,notes,source,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
  ).run(c.customer_id, c.name, c.department ?? "", c.title ?? "", c.tel ?? null, c.mobile ?? null, c.email ?? null, c.status ?? "active", c.notes ?? "", c.source ?? "manual", now, now);
  return getContact(db, Number(res.lastInsertRowid))!;
}
export function updateContact(db: Db, id: number, patch: Partial<Omit<Contact, "id" | "customer_id" | "created_at" | "updated_at">>): Contact {
  const keys = Object.keys(patch) as (keyof typeof patch)[];
  if (keys.length) {
    const set = keys.map((k) => `${k}=?`).join(", ");
    db.prepare(`UPDATE contacts SET ${set}, updated_at=? WHERE id=?`).run(...keys.map((k) => patch[k] as string | number | null), nowStamp(), id);
  }
  return getContact(db, id)!;
}
export function findContactByTel(db: Db, tel: string): Contact | null {
  const n = normalizeTel(tel);
  if (!n) return null;
  return all<Contact>(db, "SELECT * FROM contacts WHERE tel IS NOT NULL OR mobile IS NOT NULL").find((c) => (c.tel && normalizeTel(c.tel) === n) || (c.mobile && normalizeTel(c.mobile) === n)) ?? null;
}

// ---------- end customers（得意先の得意先 / 納入先） ----------
export function listEndCustomers(db: Db, customerId: number): EndCustomer[] {
  return all<EndCustomer>(db, "SELECT * FROM end_customers WHERE customer_id=? ORDER BY name", customerId);
}
export function getEndCustomer(db: Db, id: number): EndCustomer | null {
  return one<EndCustomer>(db, "SELECT * FROM end_customers WHERE id=?", id);
}
export function createEndCustomer(db: Db, e: { customer_id: number; name: string; industry?: string; notes?: string }): EndCustomer {
  const existing = one<EndCustomer>(db, "SELECT * FROM end_customers WHERE customer_id=? AND name=?", e.customer_id, e.name);
  if (existing) return existing;
  const res = db.prepare("INSERT INTO end_customers(customer_id,name,industry,notes) VALUES(?,?,?,?)").run(e.customer_id, e.name, e.industry ?? "", e.notes ?? "");
  return getEndCustomer(db, Number(res.lastInsertRowid))!;
}

// ---------- deals（案件） ----------
function hydrateDeal(db: Db, d: Deal): DealWithRefs {
  const agg = one<{ amount_open: number; amount_won: number; quote_count: number }>(
    db,
    `SELECT COALESCE(SUM(CASE WHEN status IN ('submitted','tracking','draft') THEN (SELECT SUM(qty*unit_price) FROM quote_items WHERE quote_id=q.id) END),0) AS amount_open,
            COALESCE(SUM(CASE WHEN status='won' THEN (SELECT SUM(qty*unit_price) FROM quote_items WHERE quote_id=q.id) END),0) AS amount_won,
            COUNT(*) AS quote_count
     FROM quotes q WHERE q.deal_id=?`, d.id,
  )!;
  const calls = one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM calls WHERE deal_id=?", d.id)!;
  return {
    ...d,
    customer: getCustomer(db, d.customer_id)!,
    contact: d.contact_id ? getContact(db, d.contact_id) : null,
    end_customer: d.end_customer_id ? getEndCustomer(db, d.end_customer_id) : null,
    amount: d.status === "won" ? agg.amount_won : agg.amount_open || agg.amount_won,
    quote_count: agg.quote_count,
    call_count: calls.n,
  };
}
export function createDeal(db: Db, d: { customer_id: number; contact_id?: number | null; end_customer_id?: number | null; title: string; status?: DealStatus; opened_at?: string; summary?: string }): DealWithRefs {
  const at = d.opened_at ?? nowStamp();
  const res = db.prepare(
    "INSERT INTO deals(customer_id,contact_id,end_customer_id,title,status,summary,opened_at,last_activity_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
  ).run(d.customer_id, d.contact_id ?? null, d.end_customer_id ?? null, d.title, d.status ?? "inquiry", d.summary ?? "", at, at, at, at);
  const id = Number(res.lastInsertRowid);
  addDealEvent(db, id, "created", `案件「${d.title}」を作成`, undefined, at);
  return getDeal(db, id)!;
}
export function getDeal(db: Db, id: number): DealWithRefs | null {
  const d = one<Deal>(db, "SELECT * FROM deals WHERE id=?", id);
  return d ? hydrateDeal(db, d) : null;
}
export function listDeals(db: Db, opts: { customerId?: number; contactId?: number; endCustomerId?: number; status?: DealStatus[]; openOnly?: boolean; limit?: number } = {}): DealWithRefs[] {
  const where: string[] = [];
  const params: (number | string)[] = [];
  if (opts.customerId) { where.push("customer_id=?"); params.push(opts.customerId); }
  if (opts.contactId) { where.push("contact_id=?"); params.push(opts.contactId); }
  if (opts.endCustomerId) { where.push("end_customer_id=?"); params.push(opts.endCustomerId); }
  if (opts.status?.length) { where.push(`status IN (${opts.status.map(() => "?").join(",")})`); params.push(...opts.status); }
  if (opts.openOnly) where.push("status NOT IN ('won','lost')");
  params.push(opts.limit ?? 200);
  return all<Deal>(db, `SELECT * FROM deals ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY last_activity_at DESC, id DESC LIMIT ?`, ...params).map((d) => hydrateDeal(db, d));
}
export function updateDeal(db: Db, id: number, patch: Partial<Pick<Deal, "title" | "status" | "contact_id" | "end_customer_id" | "summary" | "summary_detail" | "next_action" | "next_action_due" | "last_activity_at" | "closed_at">>): DealWithRefs {
  const keys = Object.keys(patch) as (keyof typeof patch)[];
  if (keys.length) {
    const set = keys.map((k) => `${k}=?`).join(", ");
    db.prepare(`UPDATE deals SET ${set}, updated_at=? WHERE id=?`).run(...keys.map((k) => patch[k] as string | number | null), nowStamp(), id);
  }
  return getDeal(db, id)!;
}
export function touchDeal(db: Db, id: number, at: string = nowStamp()): void {
  db.prepare("UPDATE deals SET last_activity_at=MAX(last_activity_at, ?), updated_at=? WHERE id=?").run(at, nowStamp(), id);
}
export function addDealEvent(db: Db, dealId: number, kind: string, body: string, ref?: { type: string; id: number }, at: string = nowStamp()): DealEvent {
  const res = db.prepare("INSERT INTO deal_events(deal_id,kind,body,ref_type,ref_id,created_at) VALUES(?,?,?,?,?,?)").run(dealId, kind, body, ref?.type ?? null, ref?.id ?? null, at);
  touchDeal(db, dealId, at);
  return one<DealEvent>(db, "SELECT * FROM deal_events WHERE id=?", Number(res.lastInsertRowid))!;
}
export function listDealEvents(db: Db, dealId: number): DealEvent[] {
  return all<DealEvent>(db, "SELECT * FROM deal_events WHERE deal_id=? ORDER BY created_at DESC, id DESC", dealId);
}
/** 見積りを案件に紐づける（付け替え可）。 */
export function setQuoteDeal(db: Db, quoteId: number, dealId: number | null, contactId?: number | null): void {
  const q = one<{ deal_id: number | null; quote_no: string; created_at: string; contact_id: number | null }>(db, "SELECT deal_id, quote_no, created_at, contact_id FROM quotes WHERE id=?", quoteId);
  if (!q) return;
  db.prepare("UPDATE quotes SET deal_id=?, contact_id=COALESCE(?, contact_id), updated_at=? WHERE id=?").run(dealId, contactId ?? null, nowStamp(), quoteId);
  if (q.deal_id && q.deal_id !== dealId) addDealEvent(db, q.deal_id, "link", `見積り ${q.quote_no} を別の案件へ移動`, { type: "quote", id: quoteId });
  if (dealId && q.deal_id !== dealId) addDealEvent(db, dealId, "quote", `見積り ${q.quote_no} を紐づけ`, { type: "quote", id: quoteId }, q.created_at);
}
export function setCallDeal(db: Db, callId: number, dealId: number | null, contactId?: number | null): void {
  const c = one<{ deal_id: number | null; started_at: string }>(db, "SELECT deal_id, started_at FROM calls WHERE id=?", callId);
  if (!c) return;
  db.prepare("UPDATE calls SET deal_id=?, contact_id=COALESCE(?, contact_id), updated_at=? WHERE id=?").run(dealId, contactId ?? null, nowStamp(), callId);
  if (c.deal_id && c.deal_id !== dealId) addDealEvent(db, c.deal_id, "link", `通話 #${callId} を別の案件へ移動`, { type: "call", id: callId });
  if (dealId && c.deal_id !== dealId) addDealEvent(db, dealId, "call", `通話 #${callId} を紐づけ`, { type: "call", id: callId }, c.started_at);
}

/** 担当者ごとの対応量（直近 N 日）：電話・見積り・案件の件数。売上とは別の「見えない工数」。 */
export interface ContactWorkload { contact: Contact; calls: number; quotes: number; deals: number; open_deals: number; last_contact_at: string | null }
export function contactWorkload(db: Db, customerId: number, days = 90): ContactWorkload[] {
  const since = addDays(today(), -days);
  return listContacts(db, customerId, { includeInactive: true }).map((c) => {
    const calls = one<{ n: number; last: string | null }>(db, "SELECT COUNT(*) AS n, MAX(started_at) AS last FROM calls WHERE contact_id=? AND substr(started_at,1,10)>=?", c.id, since)!;
    const quotes = one<{ n: number; last: string | null }>(db, "SELECT COUNT(*) AS n, MAX(created_at) AS last FROM quotes WHERE contact_id=? AND substr(created_at,1,10)>=?", c.id, since)!;
    const deals = one<{ n: number; open: number }>(db, "SELECT COUNT(*) AS n, SUM(CASE WHEN status NOT IN ('won','lost') THEN 1 ELSE 0 END) AS open FROM deals WHERE contact_id=?", c.id)!;
    const last = [calls.last, quotes.last].filter(Boolean).sort().pop() ?? null;
    return { contact: c, calls: calls.n, quotes: quotes.n, deals: deals.n, open_deals: deals.open ?? 0, last_contact_at: last };
  });
}

// ---------- users（自社の営業担当） ----------
export function listUsers(db: Db, opts: { includeInactive?: boolean } = {}): User[] {
  return all<User>(db, `SELECT * FROM users ${opts.includeInactive ? "" : "WHERE status='active'"} ORDER BY id`);
}
export function getUser(db: Db, id: number): User | null {
  return one<User>(db, "SELECT * FROM users WHERE id=?", id);
}
export function createUser(db: Db, u: { name: string; department?: string; email?: string | null; status?: "active" | "inactive"; target_sales?: number | null; target_margin?: number | null }): User {
  const res = db.prepare("INSERT INTO users(name,department,email,status,target_sales,target_margin) VALUES(?,?,?,?,?,?)").run(u.name, u.department ?? "", u.email ?? null, u.status ?? "active", u.target_sales ?? null, u.target_margin ?? null);
  return getUser(db, Number(res.lastInsertRowid))!;
}
export function updateUser(db: Db, id: number, patch: Partial<Pick<User, "name" | "department" | "email" | "status" | "target_sales" | "target_margin" | "proxy_send_allowed" | "calendar_ics_url" | "google_refresh_token" | "google_calendar_id" | "google_email">>): User {
  const keys = Object.keys(patch) as (keyof typeof patch)[];
  if (keys.length) db.prepare(`UPDATE users SET ${keys.map((k) => `${k}=?`).join(", ")} WHERE id=?`).run(...keys.map((k) => patch[k] as string | number | null), id);
  return getUser(db, id)!;
}

// ---------- 任意キーの設定値（CSV 取り込みの列対応など、Settings 型に無いもの） ----------
export function getRawSetting(db: Db, key: string): string | null {
  return one<{ value: string }>(db, "SELECT value FROM settings WHERE key=?", key)?.value ?? null;
}
export function setRawSetting(db: Db, key: string, value: string | null): void {
  if (value === null) db.prepare("DELETE FROM settings WHERE key=?").run(key);
  else db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, value);
}

// ---------- 横展開の「提案済み・不要」 ----------
import type { CrossSellDismissReason, CrossSellDismissal, DeliveryKind, MailLog } from "./types";
export function dismissCrossSell(db: Db, customerId: number, productId: number, reason: CrossSellDismissReason, note = ""): CrossSellDismissal {
  db.prepare("INSERT INTO crosssell_dismissals(customer_id,product_id,reason,note,created_at) VALUES(?,?,?,?,?) ON CONFLICT(customer_id,product_id) DO UPDATE SET reason=excluded.reason, note=excluded.note, created_at=excluded.created_at").run(customerId, productId, reason, note, nowStamp());
  return one<CrossSellDismissal>(db, "SELECT * FROM crosssell_dismissals WHERE customer_id=? AND product_id=?", customerId, productId)!;
}
export function undismissCrossSell(db: Db, customerId: number, productId: number): void {
  db.prepare("DELETE FROM crosssell_dismissals WHERE customer_id=? AND product_id=?").run(customerId, productId);
}
export function listCrossSellDismissals(db: Db, customerId: number): CrossSellDismissal[] {
  return all<CrossSellDismissal>(db, "SELECT * FROM crosssell_dismissals WHERE customer_id=? ORDER BY created_at DESC", customerId);
}

// ---------- 概算／確定納期 ----------
export function setDeliveryKind(db: Db, quoteId: number, kind: DeliveryKind): void {
  db.prepare("UPDATE quotes SET delivery_kind=?, updated_at=? WHERE id=?").run(kind, nowStamp(), quoteId);
}

// ---------- 訪問予定 ----------
import type { Visit, VisitWithCustomer } from "./types";
function hydrateVisit(db: Db, v: Visit): VisitWithCustomer { return { ...v, customer: v.customer_id ? getCustomer(db, v.customer_id) : null }; }
export function createVisit(db: Db, v: { user_id: number | null; customer_id?: number | null; title: string; starts_at: string; ends_at?: string | null; place?: string; source?: "manual" | "ics"; external_id?: string | null; notes?: string }): VisitWithCustomer {
  const now = nowStamp();
  const res = db.prepare("INSERT INTO visits(user_id,customer_id,title,starts_at,ends_at,place,source,external_id,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
    .run(v.user_id, v.customer_id ?? null, v.title, v.starts_at, v.ends_at ?? null, v.place ?? "", v.source ?? "manual", v.external_id ?? null, v.notes ?? "", now, now);
  return getVisit(db, Number(res.lastInsertRowid))!;
}
export function getVisit(db: Db, id: number): VisitWithCustomer | null {
  const v = one<Visit>(db, "SELECT * FROM visits WHERE id=?", id);
  return v ? hydrateVisit(db, v) : null;
}
/** 期間内の訪問予定（開始時刻順）。from/to は "YYYY-MM-DD" または "YYYY-MM-DD HH:MM"。 */
export function listVisits(db: Db, opts: { userId?: number | null; from?: string; to?: string; limit?: number } = {}): VisitWithCustomer[] {
  const where: string[] = []; const params: (string | number)[] = [];
  if (opts.userId) { where.push("user_id=?"); params.push(opts.userId); }
  if (opts.from) { where.push("COALESCE(ends_at, starts_at) >= ?"); params.push(opts.from); }
  if (opts.to) { where.push("starts_at <= ?"); params.push(opts.to); }
  params.push(opts.limit ?? 200);
  return all<Visit>(db, `SELECT * FROM visits ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY starts_at, id LIMIT ?`, ...params).map((v) => hydrateVisit(db, v));
}
export function updateVisit(db: Db, id: number, patch: Partial<Pick<Visit, "customer_id" | "title" | "starts_at" | "ends_at" | "place" | "notes">>): VisitWithCustomer {
  const keys = Object.keys(patch) as (keyof typeof patch)[];
  if (keys.length) db.prepare(`UPDATE visits SET ${keys.map((k) => `${k}=?`).join(", ")}, updated_at=? WHERE id=?`).run(...keys.map((k) => patch[k] as string | number | null), nowStamp(), id);
  return getVisit(db, id)!;
}
export function deleteVisit(db: Db, id: number): void { db.prepare("DELETE FROM visits WHERE id=?").run(id); }
/** カレンダー取り込み：同じ UID は更新、無ければ追加。手で直した得意先の紐づけは保つ。 */
export function upsertIcsVisit(db: Db, v: { user_id: number; external_id: string; title: string; starts_at: string; ends_at: string | null; place: string; customer_id: number | null }): { visit: VisitWithCustomer; created: boolean } {
  const prev = one<Visit>(db, "SELECT * FROM visits WHERE user_id=? AND source='ics' AND external_id=?", v.user_id, v.external_id);
  if (prev) {
    updateVisit(db, prev.id, { title: v.title, starts_at: v.starts_at, ends_at: v.ends_at, place: v.place, customer_id: prev.customer_id ?? v.customer_id });
    return { visit: getVisit(db, prev.id)!, created: false };
  }
  return { visit: createVisit(db, { ...v, source: "ics" }), created: true };
}
/** 取り込み元から消えた ICS 予定を消す（期間内のみ）。 */
export function pruneIcsVisits(db: Db, userId: number, keepExternalIds: Set<string>, from: string, to: string): number {
  const rows = all<Visit>(db, "SELECT * FROM visits WHERE user_id=? AND source='ics' AND starts_at>=? AND starts_at<=?", userId, from, to);
  let n = 0;
  for (const r of rows) if (r.external_id && !keepExternalIds.has(r.external_id)) { deleteVisit(db, r.id); n++; }
  return n;
}

// ---------- 問い合わせ回答 ----------
import type { Inquiry, InquiryChannel, InquiryKind, InquiryStatus, InquiryWithRefs, ShareItem } from "./types";
function hydrateInquiry(db: Db, i: Inquiry): InquiryWithRefs { return { ...i, customer: i.customer_id ? getCustomer(db, i.customer_id) : null, contact: i.contact_id ? getContact(db, i.contact_id) : null }; }
export function createInquiry(db: Db, i: { user_id?: number | null; customer_id?: number | null; contact_id?: number | null; deal_id?: number | null; channel?: InquiryChannel; kind?: InquiryKind; question: string; due?: string | null; source?: string }): InquiryWithRefs {
  const now = nowStamp();
  const res = db.prepare("INSERT INTO inquiries(user_id,customer_id,contact_id,deal_id,channel,kind,question,status,due,source,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(i.user_id ?? null, i.customer_id ?? null, i.contact_id ?? null, i.deal_id ?? null, i.channel ?? "mail", i.kind ?? "other", i.question, "open", i.due ?? null, i.source ?? "manual", now, now);
  return getInquiry(db, Number(res.lastInsertRowid))!;
}
export function getInquiry(db: Db, id: number): InquiryWithRefs | null {
  const i = one<Inquiry>(db, "SELECT * FROM inquiries WHERE id=?", id);
  return i ? hydrateInquiry(db, i) : null;
}
export function listInquiries(db: Db, opts: { status?: InquiryStatus[]; customerId?: number; userId?: number | null; limit?: number } = {}): InquiryWithRefs[] {
  const where: string[] = []; const params: (string | number)[] = [];
  if (opts.status?.length) { where.push(`status IN (${opts.status.map(() => "?").join(",")})`); params.push(...opts.status); }
  if (opts.customerId) { where.push("customer_id=?"); params.push(opts.customerId); }
  if (opts.userId) { where.push("(user_id=? OR user_id IS NULL)"); params.push(opts.userId); }
  params.push(opts.limit ?? 100);
  return all<Inquiry>(db, `SELECT * FROM inquiries ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END, COALESCE(due,'9999') ASC, created_at DESC LIMIT ?`, ...params).map((i) => hydrateInquiry(db, i));
}
export function updateInquiry(db: Db, id: number, patch: Partial<Pick<Inquiry, "customer_id" | "contact_id" | "deal_id" | "channel" | "kind" | "question" | "answer" | "answer_channel" | "status" | "due" | "answered_at">>): InquiryWithRefs {
  const keys = Object.keys(patch) as (keyof typeof patch)[];
  if (keys.length) db.prepare(`UPDATE inquiries SET ${keys.map((k) => `${k}=?`).join(", ")}, updated_at=? WHERE id=?`).run(...keys.map((k) => patch[k] as string | number | null), nowStamp(), id);
  return getInquiry(db, id)!;
}
export function deleteInquiry(db: Db, id: number): void { db.prepare("DELETE FROM inquiries WHERE id=?").run(id); }

// ---------- 共有メニューからの一時保管（1 時間で消す） ----------
export function createShareItem(db: Db, s: { token: string; title?: string; text?: string; url?: string; file_name?: string | null; file_mime?: string | null; file_blob?: Buffer | null }): ShareItem {
  db.prepare("DELETE FROM share_inbox WHERE created_at < datetime('now','localtime','-1 hour')").run();
  db.prepare("INSERT INTO share_inbox(token,title,text,url,file_name,file_mime,file_blob,created_at) VALUES(?,?,?,?,?,?,?,?)").run(s.token, s.title ?? "", s.text ?? "", s.url ?? "", s.file_name ?? null, s.file_mime ?? null, s.file_blob ?? null, nowStamp());
  return getShareItem(db, s.token)!;
}
export function getShareItem(db: Db, token: string): ShareItem | null {
  return one<ShareItem>(db, "SELECT id, token, title, text, url, file_name, file_mime, created_at FROM share_inbox WHERE token=? AND created_at >= datetime('now','localtime','-1 hour')", token);
}
export function getShareFile(db: Db, token: string): { name: string; mime: string; blob: Buffer } | null {
  const r = db.prepare("SELECT file_name, file_mime, file_blob FROM share_inbox WHERE token=? AND file_blob IS NOT NULL AND created_at >= datetime('now','localtime','-1 hour')").get(token) as { file_name: string; file_mime: string; file_blob: Uint8Array } | undefined;
  return r ? { name: r.file_name, mime: r.file_mime, blob: Buffer.from(r.file_blob) } : null;
}
export function deleteShareItem(db: Db, token: string): void { db.prepare("DELETE FROM share_inbox WHERE token=?").run(token); }

// ---------- メーカー回答（明細の仕入れ回答） ----------
export function updateQuoteItem(db: Db, itemId: number, patch: Partial<Pick<QuoteItem, "unit_price" | "cost" | "supplier_id" | "supplier_delivery" | "remarks" | "supplier_quote_price" | "supplier_quote_valid_until" | "supplier_quote_min_lot" | "supplier_quote_note" | "supplier_quote_at">>): QuoteItem | null {
  const keys = Object.keys(patch) as (keyof typeof patch)[];
  if (keys.length) db.prepare(`UPDATE quote_items SET ${keys.map((k) => `${k}=?`).join(", ")} WHERE id=?`).run(...keys.map((k) => patch[k] as string | number | null), itemId);
  const it = one<QuoteItem>(db, "SELECT * FROM quote_items WHERE id=?", itemId);
  if (it) touch(db, it.quote_id);
  return it;
}

// ---------- メール送信履歴（自分宛て・代理送付） ----------
export function addMailLog(db: Db, m: { quote_id: number | null; user_id: number | null; kind: "self" | "customer"; to_addr: string; cc_addr?: string | null; subject: string }): MailLog {
  const res = db.prepare("INSERT INTO mail_log(quote_id,user_id,kind,to_addr,cc_addr,subject,created_at) VALUES(?,?,?,?,?,?,?)").run(m.quote_id, m.user_id, m.kind, m.to_addr, m.cc_addr ?? null, m.subject, nowStamp());
  return one<MailLog>(db, "SELECT * FROM mail_log WHERE id=?", Number(res.lastInsertRowid))!;
}
export function listMailLog(db: Db, opts: { quoteId?: number; limit?: number } = {}): MailLog[] {
  return opts.quoteId
    ? all<MailLog>(db, "SELECT * FROM mail_log WHERE quote_id=? ORDER BY created_at DESC LIMIT ?", opts.quoteId, opts.limit ?? 50)
    : all<MailLog>(db, "SELECT * FROM mail_log ORDER BY created_at DESC LIMIT ?", opts.limit ?? 50);
}
/** 得意先の担当ユーザーを設定（履歴なしの初期設定用。引継ぎは domain/handover.ts の handoverCustomer を使う）。 */
export function setCustomerOwner(db: Db, customerId: number, userId: number | null): void {
  db.prepare("UPDATE customers SET owner_user_id=? WHERE id=?").run(userId, customerId);
}
export function listCustomersByOwner(db: Db, userId: number): Customer[] {
  return all<Customer>(db, "SELECT * FROM customers WHERE owner_user_id=? ORDER BY code", userId);
}
export function addOwnerRecord(db: Db, r: { customer_id: number; from_user_id: number | null; to_user_id: number; handed_at?: string; note?: string; handover_doc?: string }): CustomerOwnerRecord {
  const res = db.prepare("INSERT INTO customer_owners(customer_id,from_user_id,to_user_id,handed_at,note,handover_doc) VALUES(?,?,?,?,?,?)").run(r.customer_id, r.from_user_id, r.to_user_id, r.handed_at ?? nowStamp(), r.note ?? "", r.handover_doc ?? "");
  return one<CustomerOwnerRecord>(db, "SELECT * FROM customer_owners WHERE id=?", Number(res.lastInsertRowid))!;
}
export function ownerHistory(db: Db, customerId: number): CustomerOwnerRecord[] {
  return all<CustomerOwnerRecord>(db, "SELECT * FROM customer_owners WHERE customer_id=? ORDER BY handed_at DESC, id DESC", customerId);
}
/** あるユーザーが「過去に担当していた」得意先（現在は別ユーザー）。 */
export function pastCustomersOfUser(db: Db, userId: number): { customer: Customer; handed_at: string; to_user: User | null; record_id: number }[] {
  return all<CustomerOwnerRecord>(db, "SELECT * FROM customer_owners WHERE from_user_id=? ORDER BY handed_at DESC", userId)
    .map((r) => ({ customer: getCustomer(db, r.customer_id)!, handed_at: r.handed_at, to_user: getUser(db, r.to_user_id), record_id: r.id }))
    .filter((x) => x.customer && x.customer.owner_user_id !== userId);
}

// ---------- chats（チャット履歴：ユーザーごとに 1 本） ----------
export function getChatTurns<T>(db: Db, userId: number | null): T[] {
  const r = one<{ turns_json: string }>(db, "SELECT turns_json FROM chats WHERE user_id=?", userId ?? 0);
  if (!r) return [];
  try { return JSON.parse(r.turns_json) as T[]; } catch { return []; }
}
export function saveChatTurns<T>(db: Db, userId: number | null, turns: T[]): void {
  db.prepare("INSERT INTO chats(user_id,turns_json,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET turns_json=excluded.turns_json, updated_at=excluded.updated_at").run(userId ?? 0, JSON.stringify(turns.slice(-60)), nowStamp());
}
export function clearChat(db: Db, userId: number | null): void {
  db.prepare("DELETE FROM chats WHERE user_id=?").run(userId ?? 0);
}

export type { Row };
