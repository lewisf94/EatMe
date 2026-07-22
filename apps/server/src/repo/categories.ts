import { db } from "../db.js";
import { newId, type Category, type CategoryInput, type CategoryPatch } from "@eatme/shared";

type CatRow = {
  id: string;
  name: string;
  open_life_days: number | null;
  warn_days: number;
};

function toCat(r: CatRow): Category {
  return {
    id: r.id,
    name: r.name,
    openLifeDays: r.open_life_days,
    warnDays: r.warn_days,
  };
}

const SELECT = "SELECT id, name, open_life_days, warn_days FROM categories";

export function listCategories(): Category[] {
  return (db.prepare(`${SELECT} ORDER BY name`).all() as CatRow[]).map(toCat);
}

export function getCategory(id: string): Category | undefined {
  const r = db.prepare(`${SELECT} WHERE id = ?`).get(id) as CatRow | undefined;
  return r ? toCat(r) : undefined;
}

export function createCategory(input: CategoryInput): Category {
  const id = newId();
  db.prepare(
    "INSERT INTO categories (id, name, open_life_days, warn_days) VALUES (?, ?, ?, ?)",
  ).run(id, input.name, input.openLifeDays ?? null, input.warnDays);
  return getCategory(id) as Category;
}

export function updateCategory(id: string, patch: CategoryPatch): Category | undefined {
  const cols: Record<string, string> = {
    name: "name",
    openLifeDays: "open_life_days",
    warnDays: "warn_days",
  };
  const sets: string[] = [];
  const vals: Array<string | number | null> = [];
  const p = patch as Record<string, unknown>;
  for (const [key, col] of Object.entries(cols)) {
    if (p[key] === undefined) continue;
    sets.push(`${col} = ?`);
    vals.push((p[key] as string | number | null) ?? null);
  }
  if (sets.length === 0) return getCategory(id);
  const info = db.prepare(`UPDATE categories SET ${sets.join(", ")} WHERE id = ?`).run(...vals, id);
  return info.changes ? getCategory(id) : undefined;
}

/** id → Category, for status computation across a list of items. */
export function categoriesMap(): Map<string, Category> {
  return new Map(listCategories().map((c) => [c.id, c]));
}
