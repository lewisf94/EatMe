-- Split the overloaded `items` table into three concerns — product *identity*,
-- a physical *stock lot* (pack/batch), and a reusable *container* (a QR-labelled
-- spice jar) — and re-key history to the lot. Existing rows are migrated and the
-- old tables dropped. See docs/plan/11-phase-data-model.md.

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  brand TEXT,
  barcode TEXT,
  category_id TEXT NOT NULL REFERENCES categories(id),
  default_location_id TEXT REFERENCES locations(id),
  package_quantity REAL,
  package_unit TEXT,
  image_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX products_barcode ON products (barcode);

CREATE TABLE stock_lots (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  count INTEGER NOT NULL DEFAULT 1,
  fraction_left REAL NOT NULL DEFAULT 1,
  purchased_at TEXT,
  -- the date printed on THIS pack decides safety vs quality, not the category
  date_type TEXT CHECK (date_type IN ('use_by', 'best_before') OR date_type IS NULL),
  date_value TEXT,
  opened_at TEXT,
  open_life_days_override INTEGER,
  archived_at TEXT,
  archive_reason TEXT,
  source TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX stock_lots_product ON stock_lots (product_id);
CREATE INDEX stock_lots_active ON stock_lots (archived_at);

CREATE TABLE containers (
  id TEXT PRIMARY KEY,
  qr_uid TEXT NOT NULL UNIQUE,
  name TEXT,
  product_id TEXT REFERENCES products(id),
  location_id TEXT REFERENCES locations(id),
  current_stock_lot_id TEXT REFERENCES stock_lots(id)
);

CREATE TABLE usage_events (
  id TEXT PRIMARY KEY,
  stock_lot_id TEXT NOT NULL REFERENCES stock_lots(id),
  event TEXT NOT NULL,
  fraction_after REAL,
  reason TEXT,
  at TEXT NOT NULL
);
CREATE INDEX usage_events_lot ON usage_events (stock_lot_id);

-- Map each existing item to its deduped product id: group by barcode when
-- present, else by name+brand (case-insensitive); the product id is MIN(item id)
-- within the group so it is deterministic and stable.
CREATE TABLE _dm_map AS
SELECT
  i.id AS item_id,
  (
    SELECT MIN(j.id)
    FROM items j
    WHERE COALESCE(NULLIF(TRIM(j.barcode), ''), 'nb:' || lower(j.name) || '|' || lower(COALESCE(j.brand, '')))
        = COALESCE(NULLIF(TRIM(i.barcode), ''), 'nb:' || lower(i.name) || '|' || lower(COALESCE(i.brand, '')))
  ) AS product_id
FROM items i;

-- One product per group. With a single MIN() aggregate, SQLite fills the bare
-- columns from the same (MIN id) row.
INSERT INTO products (id, name, brand, barcode, category_id, default_location_id,
                      package_quantity, package_unit, image_url, created_at, updated_at)
SELECT MIN(i.id), i.name, i.brand, NULLIF(TRIM(i.barcode), ''), i.category_id, i.location_id,
       i.quantity_total, i.unit, i.photo_url, i.created_at, i.updated_at
FROM items i
GROUP BY COALESCE(NULLIF(TRIM(i.barcode), ''), 'nb:' || lower(i.name) || '|' || lower(COALESCE(i.brand, '')));

-- One stock lot per existing item (reusing the item id as the lot id, which keeps
-- usage history keys stable). We can't retro-know use-by, so a printed date
-- becomes best_before; the user can correct it.
INSERT INTO stock_lots (id, product_id, location_id, count, fraction_left, purchased_at,
                        date_type, date_value, opened_at, open_life_days_override,
                        archived_at, archive_reason, source, created_at, updated_at)
SELECT i.id, m.product_id, i.location_id, 1, i.fraction_left, NULL,
       CASE WHEN i.best_before IS NOT NULL THEN 'best_before' END, i.best_before,
       i.opened_at, i.open_life_days,
       i.archived_at,
       (SELECT ul.reason FROM usage_log ul
         WHERE ul.item_id = i.id AND ul.event = 'archived' ORDER BY ul.at DESC LIMIT 1),
       'migrated', i.created_at, i.updated_at
FROM items i JOIN _dm_map m ON m.item_id = i.id;

-- One container per item, preserving the printed QR uid so existing labels still
-- deep-link. Its current lot is the lot we just created.
INSERT INTO containers (id, qr_uid, name, product_id, location_id, current_stock_lot_id)
SELECT 'ctr_' || i.id, i.qr_uid, i.name, m.product_id, i.location_id, i.id
FROM items i JOIN _dm_map m ON m.item_id = i.id;

-- History moves to the lot (item id == lot id, so item_id maps straight across).
INSERT INTO usage_events (id, stock_lot_id, event, fraction_after, reason, at)
SELECT id, item_id, event, fraction_after, reason, at FROM usage_log;

DROP TABLE _dm_map;
DROP TABLE usage_log;
DROP TABLE items;
