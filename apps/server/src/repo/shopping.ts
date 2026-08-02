import { db } from "../db.js";
import { newId, type ShoppingItem } from "@eatme/shared";

type Row = {
  id: string;
  product_id: string | null;
  name: string;
  added_at: string;
  done_at: string | null;
};

const COLS = "id, product_id, name, added_at, done_at";
const toItem = (r: Row): ShoppingItem => ({
  id: r.id,
  productId: r.product_id,
  name: r.name,
  addedAt: r.added_at,
  doneAt: r.done_at,
});

/** Open rows first (that's the list you shop from), newest additions last. */
export function listShopping(includeDone = false): ShoppingItem[] {
  const sql = `SELECT ${COLS} FROM shopping_list ${
    includeDone ? "" : "WHERE done_at IS NULL"
  } ORDER BY done_at IS NOT NULL, added_at`;
  return (db.prepare(sql).all() as Row[]).map(toItem);
}

export function getShopping(id: string): ShoppingItem | undefined {
  const r = db.prepare(`SELECT ${COLS} FROM shopping_list WHERE id = ?`).get(id) as Row | undefined;
  return r ? toItem(r) : undefined;
}

/** True when this product is already waiting on the list — so finishing a
 *  second pack of the same thing doesn't add it twice. */
export function hasOpenFor(productId: string): boolean {
  return (
    db
      .prepare("SELECT 1 FROM shopping_list WHERE product_id = ? AND done_at IS NULL")
      .get(productId) !== undefined
  );
}

export function hasOpenName(name: string): boolean {
  return Boolean(
    db
      .prepare(
        "SELECT 1 FROM shopping_list WHERE done_at IS NULL AND lower(name) = lower(?) LIMIT 1",
      )
      .get(name.trim()),
  );
}

export function addShopping(input: { name: string; productId?: string | null }): ShoppingItem {
  const id = newId();
  db.prepare(
    "INSERT INTO shopping_list (id, product_id, name, added_at, done_at) VALUES (?, ?, ?, ?, NULL)",
  ).run(id, input.productId ?? null, input.name, new Date().toISOString());
  return getShopping(id) as ShoppingItem;
}

export function setDone(id: string, done: boolean): ShoppingItem | undefined {
  const info = db
    .prepare("UPDATE shopping_list SET done_at = ? WHERE id = ?")
    .run(done ? new Date().toISOString() : null, id);
  return info.changes ? getShopping(id) : undefined;
}

export function deleteShopping(id: string): boolean {
  return db.prepare("DELETE FROM shopping_list WHERE id = ?").run(id).changes > 0;
}
