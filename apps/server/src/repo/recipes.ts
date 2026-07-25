import { db } from "../db.js";
import {
  DIETARY_REQUIREMENTS,
  newId,
  type DietaryRequirement,
  type Recipe,
  type RecipeInput,
  type RecipePatch,
} from "@eatme/shared";

type RecipeRow = {
  id: string;
  name: string;
  url: string | null;
  notes: string | null;
  created_at: string;
  dietary_tags: string;
  starter_key: string | null;
};

const RECIPE_COLS = "id, name, url, notes, created_at, dietary_tags, starter_key";
const listStmt = db.prepare(`SELECT ${RECIPE_COLS} FROM recipes ORDER BY name`);
const byIdStmt = db.prepare(`SELECT ${RECIPE_COLS} FROM recipes WHERE id = ?`);
const ingStmt = db.prepare("SELECT recipe_id, match_text FROM recipe_ingredients ORDER BY rowid");

function ingredientsByRecipe(): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const r of ingStmt.all() as Array<{ recipe_id: string; match_text: string }>) {
    const list = map.get(r.recipe_id) ?? [];
    list.push(r.match_text);
    map.set(r.recipe_id, list);
  }
  return map;
}

const toRecipe = (r: RecipeRow, ingredients: string[]): Recipe => ({
  id: r.id,
  name: r.name,
  url: r.url,
  notes: r.notes,
  createdAt: r.created_at,
  ingredients,
  dietaryTags: parseDietaryTags(r.dietary_tags),
  starterKey: r.starter_key,
});

function parseDietaryTags(value: string): DietaryRequirement[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is DietaryRequirement =>
          DIETARY_REQUIREMENTS.includes(tag as DietaryRequirement),
        )
      : [];
  } catch {
    return [];
  }
}

export function listRecipes(): Recipe[] {
  const ings = ingredientsByRecipe();
  return (listStmt.all() as RecipeRow[]).map((r) => toRecipe(r, ings.get(r.id) ?? []));
}

export function getRecipe(id: string): Recipe | undefined {
  const r = byIdStmt.get(id) as RecipeRow | undefined;
  if (!r) return undefined;
  const ings = (
    db
      .prepare("SELECT match_text FROM recipe_ingredients WHERE recipe_id = ? ORDER BY rowid")
      .all(id) as Array<{ match_text: string }>
  ).map((x) => x.match_text);
  return toRecipe(r, ings);
}

/** The ingredient list is edited as a whole (chips in the UI), so a save always
 *  replaces it rather than diffing individual rows. */
function replaceIngredients(recipeId: string, ingredients: string[]): void {
  db.prepare("DELETE FROM recipe_ingredients WHERE recipe_id = ?").run(recipeId);
  const ins = db.prepare(
    "INSERT INTO recipe_ingredients (id, recipe_id, match_text, required) VALUES (?, ?, ?, 1)",
  );
  for (const raw of ingredients) {
    const text = raw.trim();
    if (text) ins.run(newId(), recipeId, text);
  }
}

export function createRecipe(input: RecipeInput, starterKey: string | null = null): Recipe {
  const id = newId();
  db.prepare(
    "INSERT INTO recipes (id, name, url, notes, created_at, dietary_tags, starter_key) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(
    id,
    input.name,
    input.url ?? null,
    input.notes ?? null,
    new Date().toISOString(),
    JSON.stringify(input.dietaryTags),
    starterKey,
  );
  replaceIngredients(id, input.ingredients);
  return getRecipe(id) as Recipe;
}

export function updateRecipe(id: string, patch: RecipePatch): Recipe | undefined {
  if (!getRecipe(id)) return undefined;
  const sets: string[] = [];
  const vals: Array<string | null> = [];
  if (patch.name !== undefined) (sets.push("name = ?"), vals.push(patch.name));
  if (patch.url !== undefined) (sets.push("url = ?"), vals.push(patch.url ?? null));
  if (patch.notes !== undefined) (sets.push("notes = ?"), vals.push(patch.notes ?? null));
  if (patch.dietaryTags !== undefined)
    (sets.push("dietary_tags = ?"), vals.push(JSON.stringify(patch.dietaryTags)));
  if (sets.length)
    db.prepare(`UPDATE recipes SET ${sets.join(", ")} WHERE id = ?`).run(...vals, id);
  if (patch.ingredients !== undefined) replaceIngredients(id, patch.ingredients);
  return getRecipe(id);
}

export function hasStarterRecipe(key: string): boolean {
  return Boolean(db.prepare("SELECT 1 FROM recipes WHERE starter_key = ?").get(key));
}

export function deleteRecipe(id: string): boolean {
  // recipe_ingredients cascades (FK ON DELETE CASCADE, foreign_keys pragma is on).
  return db.prepare("DELETE FROM recipes WHERE id = ?").run(id).changes > 0;
}
