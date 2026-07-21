# P7 · Recipes (use-it-up) + shopping list

**Goal:** turn "these three things are about to go off" into "cook this", and turn "that's finished" into "buy this". Two features that share the same expiry data the app already tracks.

**Prerequisites:** P1–P2 green (P6 optional — if present, feed the top recipe to the display).

## Deliverables

1. Migration `003_recipes_shopping.sql`: `recipes`, `recipe_ingredients`, `shopping_list`.
2. Recipe CRUD + **use-it-up ranking** endpoint.
3. Shopping-list endpoints + the auto-add/repurchase flows.
4. Web: **Recipes**, **Use it up**, **Shopping list** screens.
5. (Optional) TheMealDB inspiration search. (Optional) display shows the top recipe.

## Migration `003`

```sql
CREATE TABLE recipes (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, url TEXT, notes TEXT, created_at TEXT NOT NULL
);
CREATE TABLE recipe_ingredients (
  id TEXT PRIMARY KEY, recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  match_text TEXT NOT NULL,          -- loose, case-insensitive substring vs item.name
  required INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE shopping_list (
  id TEXT PRIMARY KEY, item_id TEXT REFERENCES items(id),  -- null for free-text adds
  name TEXT NOT NULL, added_at TEXT NOT NULL, done_at TEXT
);
```

## Use-it-up ranking

Rank recipes by how many of their ingredients match an **active item that is `use_soon` or `past_best`** (reuse `computeStatus` from `@eatme/shared`). Matching = case-insensitive substring of `match_text` in `item.name` (good enough; no ontology). Endpoint:

- `GET /api/recipes/use-it-up` → recipes sorted by `matchedUrgentCount` desc, each with the list of matched items and which ingredients are still missing. Tie-break by total matched ingredients, then name.

```ts
// services/recipes.ts (sketch)
export function rankUseItUp(recipes, ingredientsByRecipe, activeItemsWithStatus) {
  const urgent = activeItemsWithStatus.filter(i => i.status === "use_soon" || i.status === "past_best");
  return recipes.map(r => {
    const ings = ingredientsByRecipe.get(r.id) ?? [];
    const matched = ings.filter(g => urgent.some(u => u.name.toLowerCase().includes(g.match_text.toLowerCase())));
    return { recipe: r, matchedUrgentCount: matched.length, matchedItems: /* … */, missing: /* … */ };
  }).filter(x => x.matchedUrgentCount > 0)
    .sort((a, b) => b.matchedUrgentCount - a.matchedUrgentCount);
}
```
Keep it a **pure function** and unit-test it (fixtures: one recipe that uses an expiring item ranks above one that doesn't).

## Shopping list flows

- `GET /api/shopping-list`, `POST /api/shopping-list` (free-text or from an item), `POST /api/shopping-list/:id/done`, `DELETE`.
- **Auto-add on Empty**: in the `POST /api/items/:id/events` handler (P1), when an event sets `fraction_after` to `0` / event is `finished`, also insert a `shopping_list` row referencing the item (dedupe: skip if an undone row for that item exists), and archive the item (existing behaviour).
- **Prompt on Nearly-empty**: the *web* offers "add to shopping list?" when the user taps the `0.1` fraction — no server magic, just a client prompt calling the POST.
- **Repurchase revives**: ticking a shopping-list row that has an `item_id` un-archives that item and resets `fraction_left = 1`, `opened_at = null` (barcode/category/location preserved). Free-text rows just get `done_at`.

## Web

- **Recipes** (`/recipes`): list, add/edit (name, optional URL, notes, ingredient `match_text` chips). 
- **Use it up** (`/use-it-up`): the ranked recipes with their matched expiring items highlighted; also a plain "expiring soon" item list at the top (the P2 urgency query, filtered to `use_soon`/`past_best`) so it's useful even with no recipes yet.
- **Shopping list** (`/shopping`): checklist; add free-text; tick to complete (revive if linked). Badge the nav with the open count.
- (Optional) a "Find inspiration" button hitting TheMealDB (`https://www.themealdb.com/api/json/v1/1/filter.php?i=<ingredient>`), free, no key — proxy through the server to avoid CORS and to set no key in the client.

## Display hook (if P6 exists)

`gatherDashboardData()` sets `recipe` to the top `use-it-up` recipe name when one exists; otherwise leave the low-stock count. One-line change in `services/display.ts`.

## Acceptance checklist

- [ ] `pnpm check` green; `rankUseItUp` unit tests pass.
- [ ] Migration `003` applies cleanly on an existing P1 DB (test: run against a DB that already has items).
- [ ] Add a recipe with an ingredient that matches an item you've set to `use_soon`; it appears at the top of `/use-it-up`.
- [ ] Tap the Empty fraction on an item → it's archived **and** a shopping-list row appears (no duplicate on a second Empty).
- [ ] Tick that shopping-list row → the item is back in Inventory, full, unopened, same barcode/location.
- [ ] Free-text shopping add + complete works.
- [ ] (If P6) the display's footer shows the top use-it-up recipe.

## Definition of done

Expiry data now drives cooking suggestions and the shopping list. Commit `P7: recipes, use-it-up ranking, shopping list`. **Stop.**
