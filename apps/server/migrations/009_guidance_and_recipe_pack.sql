-- Local food guidance and dietary-aware starter recipes.
--
-- Stable guidance keys let the built-in matcher keep working if a user renames
-- a category or location. Existing taxonomy rows are reused where possible;
-- no user-created row or product is deleted.

ALTER TABLE locations ADD COLUMN guidance_key TEXT;
ALTER TABLE categories ADD COLUMN guidance_key TEXT;
ALTER TABLE products ADD COLUMN guidance_rule_id TEXT;
ALTER TABLE stock_lots ADD COLUMN date_estimated INTEGER NOT NULL DEFAULT 0;
ALTER TABLE recipes ADD COLUMN dietary_tags TEXT NOT NULL DEFAULT '[]';
ALTER TABLE recipes ADD COLUMN starter_key TEXT;

CREATE UNIQUE INDEX locations_guidance_key
  ON locations (guidance_key) WHERE guidance_key IS NOT NULL;
CREATE UNIQUE INDEX categories_guidance_key
  ON categories (guidance_key) WHERE guidance_key IS NOT NULL;
CREATE UNIQUE INDEX recipes_starter_key
  ON recipes (starter_key) WHERE starter_key IS NOT NULL;

-- Reuse the original built-in locations when they are still present.
UPDATE locations SET guidance_key = 'cupboard'
 WHERE id = (SELECT id FROM locations WHERE lower(name) = 'cupboard' ORDER BY rowid LIMIT 1);
UPDATE locations SET guidance_key = 'spice_rack'
 WHERE id = (SELECT id FROM locations WHERE lower(name) = 'spice rack' ORDER BY rowid LIMIT 1);
UPDATE locations SET guidance_key = 'fridge'
 WHERE id = (SELECT id FROM locations WHERE lower(name) = 'fridge' ORDER BY rowid LIMIT 1);
UPDATE locations SET guidance_key = 'freezer'
 WHERE id = (SELECT id FROM locations WHERE lower(name) = 'freezer' ORDER BY rowid LIMIT 1);
UPDATE locations SET guidance_key = 'baking_shelf'
 WHERE id = (SELECT id FROM locations WHERE lower(name) = 'baking shelf' ORDER BY rowid LIMIT 1);

INSERT INTO locations (id, name, sort_order, guidance_key)
SELECT 'builtin-loc-cupboard', 'Cupboard', 0, 'cupboard'
 WHERE NOT EXISTS (SELECT 1 FROM locations WHERE guidance_key = 'cupboard');
INSERT INTO locations (id, name, sort_order, guidance_key)
SELECT 'builtin-loc-fridge', 'Fridge', 1, 'fridge'
 WHERE NOT EXISTS (SELECT 1 FROM locations WHERE guidance_key = 'fridge');
INSERT INTO locations (id, name, sort_order, guidance_key)
SELECT 'builtin-loc-freezer', 'Freezer', 2, 'freezer'
 WHERE NOT EXISTS (SELECT 1 FROM locations WHERE guidance_key = 'freezer');
INSERT INTO locations (id, name, sort_order, guidance_key)
SELECT 'builtin-loc-counter', 'Counter / fruit bowl', 3, 'counter'
 WHERE NOT EXISTS (SELECT 1 FROM locations WHERE guidance_key = 'counter');
INSERT INTO locations (id, name, sort_order, guidance_key)
SELECT 'builtin-loc-bread-bin', 'Bread bin', 4, 'bread_bin'
 WHERE NOT EXISTS (SELECT 1 FROM locations WHERE guidance_key = 'bread_bin');
INSERT INTO locations (id, name, sort_order, guidance_key)
SELECT 'builtin-loc-spice-rack', 'Spice rack', 5, 'spice_rack'
 WHERE NOT EXISTS (SELECT 1 FROM locations WHERE guidance_key = 'spice_rack');
INSERT INTO locations (id, name, sort_order, guidance_key)
SELECT 'builtin-loc-baking-shelf', 'Baking shelf', 6, 'baking_shelf'
 WHERE NOT EXISTS (SELECT 1 FROM locations WHERE guidance_key = 'baking_shelf');

-- Reuse a handful of the original cupboard-focused categories, widening their
-- labels where the new guidance covers the same foods.
UPDATE categories SET guidance_key = 'herbs_spices', name = 'Herbs & spices'
 WHERE id = (SELECT id FROM categories WHERE lower(name) = 'ground spices' ORDER BY rowid LIMIT 1);
UPDATE categories SET guidance_key = 'sauces_condiments', name = 'Sauces & condiments'
 WHERE id = (SELECT id FROM categories WHERE lower(name) = 'cooking sauces (jar)' ORDER BY rowid LIMIT 1);
UPDATE categories SET guidance_key = 'tinned_jarred', name = 'Tinned & jarred food'
 WHERE id = (SELECT id FROM categories WHERE lower(name) = 'tins (unopened)' ORDER BY rowid LIMIT 1);
UPDATE categories SET guidance_key = 'oils_fats', name = 'Oils & fats'
 WHERE id = (SELECT id FROM categories WHERE lower(name) = 'oils' ORDER BY rowid LIMIT 1);
UPDATE categories SET guidance_key = 'nuts_seeds_dried_fruit', name = 'Nuts, seeds & dried fruit'
 WHERE id = (SELECT id FROM categories WHERE lower(name) = 'nuts & seeds' ORDER BY rowid LIMIT 1);
UPDATE categories SET guidance_key = 'flour_baking'
 WHERE id = (SELECT id FROM categories WHERE lower(name) = 'flour & baking' ORDER BY rowid LIMIT 1);
UPDATE categories SET guidance_key = 'pasta_rice_grains', name = 'Pasta, rice & grains'
 WHERE id = (SELECT id FROM categories WHERE lower(name) = 'dried pasta, rice, pulses' ORDER BY rowid LIMIT 1);

INSERT INTO categories (id, name, open_life_days, warn_days, guidance_key)
SELECT 'builtin-cat-meat', 'Fresh meat & poultry', NULL, 2, 'fresh_meat_poultry'
 WHERE NOT EXISTS (SELECT 1 FROM categories WHERE guidance_key = 'fresh_meat_poultry');
INSERT INTO categories (id, name, open_life_days, warn_days, guidance_key)
SELECT 'builtin-cat-seafood', 'Fish & seafood', NULL, 2, 'seafood'
 WHERE NOT EXISTS (SELECT 1 FROM categories WHERE guidance_key = 'seafood');
INSERT INTO categories (id, name, open_life_days, warn_days, guidance_key)
SELECT 'builtin-cat-dairy', 'Dairy & cheese', NULL, 3, 'dairy_cheese'
 WHERE NOT EXISTS (SELECT 1 FROM categories WHERE guidance_key = 'dairy_cheese');
INSERT INTO categories (id, name, open_life_days, warn_days, guidance_key)
SELECT 'builtin-cat-eggs', 'Eggs', NULL, 5, 'eggs'
 WHERE NOT EXISTS (SELECT 1 FROM categories WHERE guidance_key = 'eggs');
INSERT INTO categories (id, name, open_life_days, warn_days, guidance_key)
SELECT 'builtin-cat-fruit', 'Fresh fruit', NULL, 3, 'fresh_fruit'
 WHERE NOT EXISTS (SELECT 1 FROM categories WHERE guidance_key = 'fresh_fruit');
INSERT INTO categories (id, name, open_life_days, warn_days, guidance_key)
SELECT 'builtin-cat-vegetables', 'Fresh vegetables', NULL, 3, 'fresh_vegetables'
 WHERE NOT EXISTS (SELECT 1 FROM categories WHERE guidance_key = 'fresh_vegetables');
INSERT INTO categories (id, name, open_life_days, warn_days, guidance_key)
SELECT 'builtin-cat-frozen', 'Frozen foods', NULL, 14, 'frozen_foods'
 WHERE NOT EXISTS (SELECT 1 FROM categories WHERE guidance_key = 'frozen_foods');
INSERT INTO categories (id, name, open_life_days, warn_days, guidance_key)
SELECT 'builtin-cat-bread', 'Bread & bakery', NULL, 2, 'bread_bakery'
 WHERE NOT EXISTS (SELECT 1 FROM categories WHERE guidance_key = 'bread_bakery');
INSERT INTO categories (id, name, open_life_days, warn_days, guidance_key)
SELECT 'builtin-cat-leftovers', 'Cooked food & leftovers', 2, 1, 'cooked_leftovers'
 WHERE NOT EXISTS (SELECT 1 FROM categories WHERE guidance_key = 'cooked_leftovers');
INSERT INTO categories (id, name, open_life_days, warn_days, guidance_key)
SELECT 'builtin-cat-deli', 'Deli & ready-to-eat', NULL, 2, 'deli_ready'
 WHERE NOT EXISTS (SELECT 1 FROM categories WHERE guidance_key = 'deli_ready');
INSERT INTO categories (id, name, open_life_days, warn_days, guidance_key)
SELECT 'builtin-cat-sauces', 'Sauces & condiments', NULL, 7, 'sauces_condiments'
 WHERE NOT EXISTS (SELECT 1 FROM categories WHERE guidance_key = 'sauces_condiments');
INSERT INTO categories (id, name, open_life_days, warn_days, guidance_key)
SELECT 'builtin-cat-tinned', 'Tinned & jarred food', NULL, 30, 'tinned_jarred'
 WHERE NOT EXISTS (SELECT 1 FROM categories WHERE guidance_key = 'tinned_jarred');
INSERT INTO categories (id, name, open_life_days, warn_days, guidance_key)
SELECT 'builtin-cat-pasta', 'Pasta, rice & grains', NULL, 30, 'pasta_rice_grains'
 WHERE NOT EXISTS (SELECT 1 FROM categories WHERE guidance_key = 'pasta_rice_grains');
INSERT INTO categories (id, name, open_life_days, warn_days, guidance_key)
SELECT 'builtin-cat-pulses', 'Beans & pulses', NULL, 30, 'beans_pulses'
 WHERE NOT EXISTS (SELECT 1 FROM categories WHERE guidance_key = 'beans_pulses');
INSERT INTO categories (id, name, open_life_days, warn_days, guidance_key)
SELECT 'builtin-cat-cereal', 'Breakfast cereals', NULL, 30, 'breakfast_cereals'
 WHERE NOT EXISTS (SELECT 1 FROM categories WHERE guidance_key = 'breakfast_cereals');
INSERT INTO categories (id, name, open_life_days, warn_days, guidance_key)
SELECT 'builtin-cat-baking', 'Flour & baking', NULL, 30, 'flour_baking'
 WHERE NOT EXISTS (SELECT 1 FROM categories WHERE guidance_key = 'flour_baking');
INSERT INTO categories (id, name, open_life_days, warn_days, guidance_key)
SELECT 'builtin-cat-spices', 'Herbs & spices', NULL, 30, 'herbs_spices'
 WHERE NOT EXISTS (SELECT 1 FROM categories WHERE guidance_key = 'herbs_spices');
INSERT INTO categories (id, name, open_life_days, warn_days, guidance_key)
SELECT 'builtin-cat-nuts', 'Nuts, seeds & dried fruit', NULL, 21, 'nuts_seeds_dried_fruit'
 WHERE NOT EXISTS (SELECT 1 FROM categories WHERE guidance_key = 'nuts_seeds_dried_fruit');
INSERT INTO categories (id, name, open_life_days, warn_days, guidance_key)
SELECT 'builtin-cat-oils', 'Oils & fats', NULL, 30, 'oils_fats'
 WHERE NOT EXISTS (SELECT 1 FROM categories WHERE guidance_key = 'oils_fats');
INSERT INTO categories (id, name, open_life_days, warn_days, guidance_key)
SELECT 'builtin-cat-snacks', 'Snacks & confectionery', NULL, 30, 'snacks_confectionery'
 WHERE NOT EXISTS (SELECT 1 FROM categories WHERE guidance_key = 'snacks_confectionery');
INSERT INTO categories (id, name, open_life_days, warn_days, guidance_key)
SELECT 'builtin-cat-drinks', 'Drinks', NULL, 14, 'drinks'
 WHERE NOT EXISTS (SELECT 1 FROM categories WHERE guidance_key = 'drinks');
INSERT INTO categories (id, name, open_life_days, warn_days, guidance_key)
SELECT 'builtin-cat-other', 'Other food', NULL, 14, 'other_food'
 WHERE NOT EXISTS (SELECT 1 FROM categories WHERE guidance_key = 'other_food');

INSERT OR IGNORE INTO settings (key, value) VALUES ('dietary_requirements', '[]');
