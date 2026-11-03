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
  tel           TEXT,
  kind          TEXT NOT NULL DEFAULT 'end_user',
  owner_user_id INTEGER REFERENCES users(id),
  payment_terms TEXT NOT NULL DEFAULT '月末締め翌月末払い',
  notes         TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  department    TEXT NOT NULL DEFAULT '',
  email         TEXT,
  status        TEXT NOT NULL CHECK (status IN ('active','inactive')) DEFAULT 'active',
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS customer_owners (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id   INTEGER NOT NULL REFERENCES customers(id),
  from_user_id  INTEGER REFERENCES users(id),
  to_user_id    INTEGER NOT NULL REFERENCES users(id),
  handed_at     TEXT NOT NULL,
  note          TEXT NOT NULL DEFAULT '',
  handover_doc  TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS contacts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id   INTEGER NOT NULL REFERENCES customers(id),
  name          TEXT NOT NULL,
  department    TEXT NOT NULL DEFAULT '',
  title         TEXT NOT NULL DEFAULT '',
  tel           TEXT,
  mobile        TEXT,
  email         TEXT,
  status        TEXT NOT NULL CHECK (status IN ('active','transferred','retired')) DEFAULT 'active',
  notes         TEXT NOT NULL DEFAULT '',
  source        TEXT NOT NULL DEFAULT 'manual',
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS end_customers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id   INTEGER NOT NULL REFERENCES customers(id),
  name          TEXT NOT NULL,
  industry      TEXT NOT NULL DEFAULT '',
  notes         TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS deals (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id   INTEGER NOT NULL REFERENCES customers(id),
  contact_id    INTEGER REFERENCES contacts(id),
  end_customer_id INTEGER REFERENCES end_customers(id),
  title         TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('inquiry','quoting','submitted','tracking','won','lost','dormant')) DEFAULT 'inquiry',
  summary       TEXT NOT NULL DEFAULT '',
  summary_detail TEXT NOT NULL DEFAULT '',
  next_action   TEXT NOT NULL DEFAULT '',
  next_action_due TEXT,
  opened_at     TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  last_activity_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  closed_at     TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS deal_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  deal_id       INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,
  body          TEXT NOT NULL,
  ref_type      TEXT,
  ref_id        INTEGER,
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
  contact_id    INTEGER REFERENCES contacts(id),
  deal_id       INTEGER REFERENCES deals(id),
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

CREATE TABLE IF NOT EXISTS calls (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id   INTEGER REFERENCES customers(id),
  contact_id    INTEGER REFERENCES contacts(id),
  deal_id       INTEGER REFERENCES deals(id),
  tel           TEXT,
  direction     TEXT NOT NULL CHECK (direction IN ('in','out','unknown')) DEFAULT 'unknown',
  started_at    TEXT NOT NULL,
  duration_sec  INTEGER,
  source        TEXT NOT NULL DEFAULT 'manual',
  memo          TEXT NOT NULL DEFAULT '',
  minutes_json  TEXT,
  mail_subject  TEXT,
  mail_body     TEXT,
  status        TEXT NOT NULL CHECK (status IN ('open','processed','sent','closed')) DEFAULT 'open',
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS daily_reports (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  date          TEXT NOT NULL,
  user_id       INTEGER NOT NULL DEFAULT 0,
  body          TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE(date, user_id)
);

CREATE TABLE IF NOT EXISTS chats (
  user_id       INTEGER NOT NULL PRIMARY KEY,
  turns_json    TEXT NOT NULL DEFAULT '[]',
  updated_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

/** 索引は列追加マイグレーションの後に作る（既存 DB に新列を足してから索引を張るため）。 */
export const INDEX_SQL = `
CREATE INDEX IF NOT EXISTS idx_quote_items_product ON quote_items(product_id);
CREATE INDEX IF NOT EXISTS idx_quote_items_quote ON quote_items(quote_id);
CREATE INDEX IF NOT EXISTS idx_quotes_customer ON quotes(customer_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
CREATE INDEX IF NOT EXISTS idx_supplier_prices_product ON supplier_prices(product_id);
CREATE INDEX IF NOT EXISTS idx_activities_quote ON activities(quote_id);
CREATE INDEX IF NOT EXISTS idx_calls_customer ON calls(customer_id);
CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status);
CREATE INDEX IF NOT EXISTS idx_contacts_customer ON contacts(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_owners_customer ON customer_owners(customer_id);
CREATE INDEX IF NOT EXISTS idx_deals_customer ON deals(customer_id);
CREATE INDEX IF NOT EXISTS idx_deals_status ON deals(status);
CREATE INDEX IF NOT EXISTS idx_deal_events_deal ON deal_events(deal_id);
CREATE INDEX IF NOT EXISTS idx_quotes_deal ON quotes(deal_id);
CREATE INDEX IF NOT EXISTS idx_calls_deal ON calls(deal_id);
`;
