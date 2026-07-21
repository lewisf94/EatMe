-- Receipt import: a photographed receipt becomes a reviewable batch of candidate
-- lines that, once confirmed, create stock lots and teach the alias table. All
-- local; no cloud. See docs/plan/12-phase-receipt-import.md.

CREATE TABLE purchases (
  id TEXT PRIMARY KEY,
  merchant TEXT,
  purchased_at TEXT,
  source TEXT,
  image_hash TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | confirmed | discarded
  created_at TEXT NOT NULL
);

CREATE TABLE purchase_lines (
  id TEXT PRIMARY KEY,
  purchase_id TEXT NOT NULL REFERENCES purchases(id),
  line_no INTEGER NOT NULL,
  raw_text TEXT NOT NULL,
  normalized_text TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price REAL,
  line_total REAL,
  extraction_confidence REAL,
  matched_product_id TEXT REFERENCES products(id),
  chosen_location_id TEXT REFERENCES locations(id),
  status TEXT NOT NULL DEFAULT 'pending', -- pending | added | ignored | not_tracked
  created_at TEXT NOT NULL
);
CREATE INDEX purchase_lines_purchase ON purchase_lines (purchase_id);

-- The learned mapping that does the heavy lifting: once "TESCO CHCKPEAS 400G" is
-- confirmed as a product, every future Tesco receipt matches it instantly.
CREATE TABLE receipt_aliases (
  id TEXT PRIMARY KEY,
  retailer TEXT NOT NULL DEFAULT '',
  normalized_text TEXT NOT NULL,
  product_id TEXT NOT NULL REFERENCES products(id),
  confirmed_count INTEGER NOT NULL DEFAULT 1,
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX receipt_aliases_key ON receipt_aliases (retailer, normalized_text);
