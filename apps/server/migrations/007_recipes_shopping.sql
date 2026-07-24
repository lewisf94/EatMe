-- Recipes ("what can I cook with the things about to go off?") and the shopping
-- list ("that's finished — buy it again"). Both hang off the freshness data the
-- app already keeps, so neither needs its own notion of what's in the cupboard.

CREATE TABLE recipes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT,
  notes TEXT,
  created_at TEXT NOT NULL
);

-- An ingredient is just loose match text ("chickpea") tested against product
-- names. No ontology, no units — the point is ranking, not a shopping algorithm.
CREATE TABLE recipe_ingredients (
  id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  match_text TEXT NOT NULL,
  required INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX recipe_ingredients_recipe ON recipe_ingredients (recipe_id);

-- product_id is null for a free-text add ("kitchen roll"); when it is set,
-- ticking the row puts a fresh pack of that product back in the cupboard.
CREATE TABLE shopping_list (
  id TEXT PRIMARY KEY,
  product_id TEXT REFERENCES products(id),
  name TEXT NOT NULL,
  added_at TEXT NOT NULL,
  done_at TEXT
);
CREATE INDEX shopping_list_open ON shopping_list (done_at);
