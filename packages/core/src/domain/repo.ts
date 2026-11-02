import type { Db } from "../db/connection";
import {
  DEFAULT_SETTINGS,
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
export function upsertCustomer(db: Db, c: Omit<Customer, "id">): Customer {
  db.prepare(
    `INSERT INTO customers(code,name,short_name,industry,prefecture,contact_name,contact_email,payment_terms,notes)
     VALUES(?,?,?,?,?,?,?,?,?)
     ON CONFLICT(code) DO UPDATE SET name=excluded.name, short_name=excluded.short_name, industry=excluded.industry,
       prefecture=excluded.prefecture, contact_name=excluded.contact_name, contact_email=excluded.contact_email,
       payment_terms=excluded.payment_terms, notes=excluded.notes`,
  ).run(c.code, c.name, c.short_name, c.industry, c.prefecture, c.contact_name, c.contact_email, c.payment_terms, c.notes);
  return one<Customer>(db, "SELECT * FROM customers WHERE code=?", c.code)!;
}

// ---------- suppliers ----------
export function listSuppliers(db: Db): Supplier[] {
  return all<Supplier>(db, "SELECT * FROM suppliers ORDER BY code");
}
export function getSupplier(db: Db, id: number): Supplier | null {
  return one<Supplier>(db, "SELECT * FROM suppliers WHERE id=?", id);
}
export function upsertSupplier(db: Db, s: Omit<Supplier, "id">): Supplier {
  db.prepare(
    `INSERT INTO suppliers(code,name,route_type,lead_time_days,contact_email) VALUES(?,?,?,?,?)
     ON CONFLICT(code) DO UPDATE SET name=excluded.name, route_type=excluded.route_type,
       lead_time_days=excluded.lead_time_days, contact_email=excluded.contact_email`,
  ).run(s.code, s.name, s.route_type, s.lead_time_days, s.contact_email);
  return one<Supplier>(db, "SELECT * FROM suppliers WHERE code=?", s.code)!;
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
    `INSERT INTO quotes(quote_no,customer_id,subject,status,requested_delivery,promised_delivery,valid_until,source_type,source_text,notes,
       lost_reason,lost_detail,submitted_at,closed_at,created_at,updated_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    quoteNo, q.customer_id, q.subject, q.status ?? "draft", q.requested_delivery ?? null, promised_delivery ?? null,
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

export function updateQuoteHeader(db: Db, quoteId: number, patch: Partial<Pick<Quote, "subject" | "requested_delivery" | "promised_delivery" | "valid_until" | "notes" | "customer_id">>): void {
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
export function listQuotes(db: Db, opts: { status?: QuoteStatus[]; customerId?: number; q?: string; limit?: number } = {}): QuoteSummary[] {
  const params: (string | number)[] = [];
  const where: string[] = [];
  if (opts.status?.length) { where.push(`q.status IN (${opts.status.map(() => "?").join(",")})`); params.push(...opts.status); }
  if (opts.customerId) { where.push("q.customer_id = ?"); params.push(opts.customerId); }
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

export type { Row };
