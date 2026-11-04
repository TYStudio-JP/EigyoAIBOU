import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { INDEX_SQL, SCHEMA_SQL } from "./schema";

export type Db = DatabaseSync;

/** リポジトリルート（package.json の name が eigyo-aibou のディレクトリ）を cwd から上に探す。 */
export function findRepoRoot(start: string = process.cwd()): string {
  let dir = resolve(start);
  for (let i = 0; i < 8; i++) {
    const pkg = join(dir, "package.json");
    if (existsSync(pkg)) {
      try {
        const json = JSON.parse(readFileSync(pkg, "utf8")) as { name?: string };
        if (json.name === "eigyo-aibou") return dir;
      } catch {
        /* ignore */
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(start);
}

/** 既定の DB パス。環境変数 EIGYO_DB_PATH で上書き可能。 */
export function defaultDbPath(): string {
  if (process.env.EIGYO_DB_PATH) return resolve(process.env.EIGYO_DB_PATH);
  return join(findRepoRoot(), "data", "eigyo.db");
}

let cached: { path: string; db: DatabaseSync } | null = null;

export function openDb(path: string = defaultDbPath()): DatabaseSync {
  if (cached && cached.path === path && cached.db.isOpen) return cached.db;
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  if (path !== ":memory:") db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(SCHEMA_SQL);
  migrate(db);
  db.exec(INDEX_SQL);
  cached = { path, db };
  return db;
}

/** 既存 DB への後方互換マイグレーション（列追加のみ）。 */
function migrate(db: DatabaseSync): void {
  const cols = (table: string) => (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
  const add = (table: string, col: string, ddl: string) => { if (!cols(table).includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${ddl}`); };
  add("customers", "tel", "TEXT");
  add("customers", "kind", "TEXT NOT NULL DEFAULT 'end_user'");
  add("customers", "owner_user_id", "INTEGER REFERENCES users(id)");
  add("quotes", "contact_id", "INTEGER REFERENCES contacts(id)");
  add("quotes", "deal_id", "INTEGER REFERENCES deals(id)");
  add("calls", "contact_id", "INTEGER REFERENCES contacts(id)");
  add("calls", "deal_id", "INTEGER REFERENCES deals(id)");
  // 値付けルール（掛率／粗利／端数）と暫定回答（正式未送付）— スマホ外出先モード
  add("customers", "pricing_mode", "TEXT NOT NULL DEFAULT 'none'");
  add("customers", "markup_rate", "REAL");
  add("customers", "margin_pct", "REAL");
  add("customers", "rounding_unit", "INTEGER NOT NULL DEFAULT 1");
  add("suppliers", "markup_rate", "REAL");
  add("quotes", "provisional_at", "TEXT");
  add("quotes", "provisional_channel", "TEXT");
  add("quotes", "provisional_text", "TEXT");
  add("quotes", "provisional_items_json", "TEXT");
  add("quotes", "formal_sent_at", "TEXT");
  // 目標・代理送付・概算／確定納期
  add("users", "target_sales", "REAL");
  add("users", "target_margin", "REAL");
  add("users", "proxy_send_allowed", "INTEGER NOT NULL DEFAULT 0");
  add("quotes", "delivery_kind", "TEXT NOT NULL DEFAULT 'estimate'");
  // 訪問予定（カレンダー）とメーカー回答
  add("users", "calendar_ics_url", "TEXT");
  add("quote_items", "supplier_quote_price", "REAL");
  add("quote_items", "supplier_quote_valid_until", "TEXT");
  add("quote_items", "supplier_quote_min_lot", "INTEGER");
  add("quote_items", "supplier_quote_note", "TEXT");
  add("quote_items", "supplier_quote_at", "TEXT");
  // Google カレンダー連携
  add("users", "google_refresh_token", "TEXT");
  add("users", "google_calendar_id", "TEXT");
  add("users", "google_email", "TEXT");
}

export function dbExists(path: string = defaultDbPath()): boolean {
  return path === ":memory:" ? false : existsSync(path);
}

export function closeDb(): void {
  if (cached) {
    cached.db.close();
    cached = null;
  }
}
