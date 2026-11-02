/** 営業AI棒 スキーマ（SQLite）。バンドル環境でも読めるよう文字列として同梱する。 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS customers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  short_name    TEXT NOT NULL,
  industry      TEXT NOT NULL,
  prefecture    TEXT NOT NULL,
  contact_name  TEXT,
  contact_email TEXT,
  payment_terms TEXT NOT NULL DEFAULT '月末締め翌月末払い',
  notes         TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS suppliers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  route_type    TEXT NOT NULL CHECK (route_type IN ('maker','agency','trading')),
  lead_time_days INTEGER NOT NULL DEFAULT 5,
  contact_email TEXT
);

CREATE TABLE IF NOT EXISTS products (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          TEXT NOT NULL UNIQUE,
  part_number   TEXT NOT NULL,
  name          TEXT NOT NULL,
  maker         TEXT NOT NULL,
  category      TEXT NOT NULL,
  unit          TEXT NOT NULL DEFAULT '個',
  list_price    REAL NOT NULL,
  spec          TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS supplier_prices (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id    INTEGER NOT NULL REFERENCES products(id),
  supplier_id   INTEGER NOT NULL REFERENCES suppliers(id),
  cost          REAL NOT NULL,
  min_lot       INTEGER NOT NULL DEFAULT 1,
  lead_time_days INTEGER,
  valid_from    TEXT NOT NULL,
  UNIQUE (product_id, supplier_id, valid_from)
);

CREATE TABLE IF NOT EXISTS quotes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_no      TEXT NOT NULL UNIQUE,
  customer_id   INTEGER NOT NULL REFERENCES customers(id),
  subject       TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('draft','submitted','tracking','won','lost')) DEFAULT 'draft',
  requested_delivery TEXT,
  promised_delivery  TEXT,
  valid_until   TEXT,
  source_type   TEXT NOT NULL DEFAULT 'manual',
  source_text   TEXT NOT NULL DEFAULT '',
  notes         TEXT NOT NULL DEFAULT '',
  lost_reason   TEXT,
  lost_detail   TEXT,
  submitted_at  TEXT,
  closed_at     TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS quote_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id      INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  line_no       INTEGER NOT NULL,
  product_id    INTEGER REFERENCES products(id),
  description   TEXT NOT NULL,
  qty           REAL NOT NULL,
  unit          TEXT NOT NULL DEFAULT '個',
  unit_price    REAL NOT NULL,
  cost          REAL NOT NULL DEFAULT 0,
  supplier_id   INTEGER REFERENCES suppliers(id),
  supplier_delivery TEXT,
  remarks       TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS activities (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id      INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,
  body          TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_quote_items_product ON quote_items(product_id);
CREATE INDEX IF NOT EXISTS idx_quote_items_quote ON quote_items(quote_id);
CREATE INDEX IF NOT EXISTS idx_quotes_customer ON quotes(customer_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
CREATE INDEX IF NOT EXISTS idx_supplier_prices_product ON supplier_prices(product_id);
CREATE INDEX IF NOT EXISTS idx_activities_quote ON activities(quote_id);
`;
