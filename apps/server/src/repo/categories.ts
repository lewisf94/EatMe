import { db } from "../db.js";
import { newId, type Category, type CategoryInput } from "@whattoeat/shared";

type CatRow = {
  id: string;
  name: string;
  open_life_days: number | null;
  warn_days: number;
  hard_expiry: number;
};

function toCat(r: CatRow): Category {
  return {
    id: r.id,
    name: r.name,
    openLifeDays: r.open_life_days,
    warnDays: r.warn_days,
    hardExpiry: !!r.hard_expiry,
  };
}

const SELECT = "SELECT id, name, open_life_days, warn_days, hard_expiry FROM categories";

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
    "INSERT INTO categories (id, name, open_life_days, warn_days, hard_expiry) VALUES (?, ?, ?, ?, ?)",
  ).run(id, input.name, input.openLifeDays ?? null, input.warnDays, input.hardExpiry ? 1 : 0);
  return getCategory(id) as Category;
}

/** id → Category, for status computation across a list of items. */
export function categoriesMap(): Map<string, Category> {
  return new Map(listCategories().map((c) => [c.id, c]));
}
