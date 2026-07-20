CREATE TABLE locations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  open_life_days INTEGER,
  warn_days INTEGER NOT NULL DEFAULT 14,
  hard_expiry INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  brand TEXT,
  barcode TEXT,
  category_id TEXT NOT NULL REFERENCES categories(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  photo_url TEXT,
  notes TEXT,
  quantity_total REAL,
  unit TEXT,
  fraction_left REAL NOT NULL DEFAULT 1,
  best_before TEXT,
  opened_at TEXT,
  open_life_days INTEGER,
  qr_uid TEXT NOT NULL UNIQUE,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX items_barcode ON items (barcode);
CREATE INDEX items_active ON items (archived_at);

CREATE TABLE usage_log (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id),
  event TEXT NOT NULL,
  fraction_after REAL,
  at TEXT NOT NULL
);

CREATE TABLE lookup_cache (
  barcode TEXT PRIMARY KEY,
  off_json TEXT,
  fetched_at TEXT NOT NULL
);
