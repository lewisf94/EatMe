import { db } from "../db.js";
import { newId, type Location, type LocationInput } from "@whattoeat/shared";

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
