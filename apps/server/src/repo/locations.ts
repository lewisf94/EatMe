import { db } from "../db.js";
import { newId, type Location, type LocationInput, type LocationPatch } from "@whattoeat/shared";

type LocRow = { id: string; name: string; sort_order: number };

function toLoc(r: LocRow): Location {
  return { id: r.id, name: r.name, sortOrder: r.sort_order };
}

export function listLocations(): Location[] {
  return (
    db
      .prepare("SELECT id, name, sort_order FROM locations ORDER BY sort_order, name")
      .all() as LocRow[]
  ).map(toLoc);
}

export function createLocation(input: LocationInput): Location {
  const id = newId();
  db.prepare("INSERT INTO locations (id, name, sort_order) VALUES (?, ?, ?)").run(
    id,
    input.name,
    input.sortOrder,
  );
  return { id, name: input.name, sortOrder: input.sortOrder };
}

export function getLocation(id: string): Location | undefined {
  const r = db.prepare("SELECT id, name, sort_order FROM locations WHERE id = ?").get(id) as
    | LocRow
    | undefined;
  return r ? toLoc(r) : undefined;
}

export function updateLocation(id: string, patch: LocationPatch): Location | undefined {
  const cols: Record<string, string> = { name: "name", sortOrder: "sort_order" };
  const sets: string[] = [];
  const vals: Array<string | number> = [];
  const p = patch as Record<string, unknown>;
  for (const [key, col] of Object.entries(cols)) {
    if (p[key] === undefined) continue;
    sets.push(`${col} = ?`);
    vals.push(p[key] as string | number);
  }
  if (sets.length === 0) return getLocation(id);
  const info = db.prepare(`UPDATE locations SET ${sets.join(", ")} WHERE id = ?`).run(...vals, id);
  return info.changes ? getLocation(id) : undefined;
}
