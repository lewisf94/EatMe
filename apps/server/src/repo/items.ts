import { db } from "../db.js";
import { newId, type Item, type ItemInput, type ItemPatch } from "@whattoeat/shared";

const COLS =
  "id,name,brand,barcode,category_id,location_id,photo_url,notes,quantity_total,unit,fraction_left,best_before,opened_at,open_life_days,qr_uid,archived_at,created_at,updated_at";

type ItemRow = {
  id: string;
  name: string;
  brand: string | null;
  barcode: string | null;
  category_id: string;
  location_id: string;
  photo_url: string | null;
  notes: string | null;
  quantity_total: number | null;
  unit: string | null;
  fraction_left: number;
  best_before: string | null;
  opened_at: string | null;
  open_life_days: number | null;
  qr_uid: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

function toItem(r: ItemRow): Item {
  return {
    id: r.id,
    name: r.name,
    brand: r.brand ?? undefined,
    barcode: r.barcode ?? undefined,
    categoryId: r.category_id,
    locationId: r.location_id,
    photoUrl: r.photo_url ?? undefined,
    notes: r.notes ?? undefined,
    quantityTotal: r.quantity_total ?? undefined,
    unit: r.unit ?? undefined,
    fractionLeft: r.fraction_left,
    bestBefore: r.best_before ?? undefined,
    openedAt: r.opened_at ?? undefined,
    openLifeDays: r.open_life_days ?? undefined,
    qrUid: r.qr_uid,
    archivedAt: r.archived_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const insertStmt = db.prepare(
  `INSERT INTO items (${COLS}) VALUES (@id,@name,@brand,@barcode,@categoryId,@locationId,@photoUrl,@notes,@quantityTotal,@unit,@fractionLeft,@bestBefore,@openedAt,@openLifeDays,@qrUid,NULL,@createdAt,@updatedAt)`,
);
const byIdStmt = db.prepare(`SELECT ${COLS} FROM items WHERE id = ?`);
const byQrStmt = db.prepare(`SELECT ${COLS} FROM items WHERE qr_uid = ?`);
const logStmt = db.prepare(
  "INSERT INTO usage_log (id, item_id, event, fraction_after, reason, at) VALUES (?, ?, ?, ?, ?, ?)",
);

export function logEvent(
  itemId: string,
  event: string,
  fractionAfter: number | null = null,
  reason: string | null = null,
): void {
  logStmt.run(newId(), itemId, event, fractionAfter, reason, new Date().toISOString());
}

export function getItem(id: string): Item | undefined {
  const r = byIdStmt.get(id) as ItemRow | undefined;
  return r ? toItem(r) : undefined;
}

export function getByQrUid(qrUid: string): Item | undefined {
  const r = byQrStmt.get(qrUid) as ItemRow | undefined;
  return r ? toItem(r) : undefined;
}

export function createItem(input: ItemInput): Item {
  const now = new Date().toISOString();
  const id = newId();
  insertStmt.run({
    id,
    name: input.name,
    brand: input.brand ?? null,
    barcode: input.barcode ?? null,
    categoryId: input.categoryId,
    locationId: input.locationId,
    photoUrl: input.photoUrl ?? null,
    notes: input.notes ?? null,
    quantityTotal: input.quantityTotal ?? null,
    unit: input.unit ?? null,
    fractionLeft: input.fractionLeft,
    bestBefore: input.bestBefore ?? null,
    openedAt: input.openedAt ?? null,
    openLifeDays: input.openLifeDays ?? null,
    qrUid: newId(8),
    createdAt: now,
    updatedAt: now,
  });
  logEvent(id, "added", input.fractionLeft);
  return getItem(id) as Item;
}

const PATCH_COLS: Record<string, string> = {
  name: "name",
  brand: "brand",
  barcode: "barcode",
  categoryId: "category_id",
  locationId: "location_id",
  photoUrl: "photo_url",
  notes: "notes",
  quantityTotal: "quantity_total",
  unit: "unit",
  fractionLeft: "fraction_left",
  bestBefore: "best_before",
  openedAt: "opened_at",
  openLifeDays: "open_life_days",
};

export function updateItem(id: string, patch: ItemPatch): Item | undefined {
  const sets: string[] = [];
  const vals: Array<string | number | null> = [];
  const p = patch as Record<string, unknown>;
  for (const [key, col] of Object.entries(PATCH_COLS)) {
    if (p[key] !== undefined) {
      sets.push(`${col} = ?`);
      vals.push((p[key] as string | number | null) ?? null);
    }
  }
  if (sets.length === 0) return getItem(id);
  sets.push("updated_at = ?");
  vals.push(new Date().toISOString());
  vals.push(id);
  const info = db.prepare(`UPDATE items SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  return info.changes ? getItem(id) : undefined;
}

export function archiveItem(id: string, reason: string): Item | undefined {
  const now = new Date().toISOString();
  const info = db
    .prepare("UPDATE items SET archived_at = ?, updated_at = ? WHERE id = ?")
    .run(now, now, id);
  if (!info.changes) return undefined;
  logEvent(id, "archived", null, reason);
  return getItem(id);
}

export function addEvent(
  id: string,
  event: string,
  fractionAfter: number | null,
): Item | undefined {
  if (!getItem(id)) return undefined;
  if (fractionAfter != null) {
    const now = new Date().toISOString();
    db.prepare("UPDATE items SET fraction_left = ?, updated_at = ? WHERE id = ?").run(
      fractionAfter,
      now,
      id,
    );
  }
  logEvent(id, event, fractionAfter);
  return getItem(id);
}

export function listItems(opts: {
  q?: string;
  locationId?: string;
  includeArchived?: boolean;
}): Item[] {
  const where: string[] = [];
  const vals: Array<string> = [];
  if (!opts.includeArchived) where.push("archived_at IS NULL");
  if (opts.q) {
    where.push("(name LIKE ? OR brand LIKE ?)");
    vals.push(`%${opts.q}%`, `%${opts.q}%`);
  }
  if (opts.locationId) {
    where.push("location_id = ?");
    vals.push(opts.locationId);
  }
  const sql = `SELECT ${COLS} FROM items ${where.length ? "WHERE " + where.join(" AND ") : ""}`;
  const rows = db.prepare(sql).all(...vals) as ItemRow[];
  return rows.map(toItem);
}
