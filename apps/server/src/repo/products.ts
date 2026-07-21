import { db } from "../db.js";
import { newId, type Product, type ProductInput, type ProductPatch } from "@eatme/shared";

const COLS =
  "id, name, brand, barcode, category_id, default_location_id, package_quantity, package_unit, image_url, created_at, updated_at";

type ProductRow = {
  id: string;
  name: string;
  brand: string | null;
  barcode: string | null;
  category_id: string;
  default_location_id: string | null;
  package_quantity: number | null;
  package_unit: string | null;
  image_url: string | null;
  created_at: string;
  updated_at: string;
};

function toProduct(r: ProductRow): Product {
  return {
    id: r.id,
    name: r.name,
    brand: r.brand,
    barcode: r.barcode,
    categoryId: r.category_id,
    defaultLocationId: r.default_location_id,
    packageQuantity: r.package_quantity,
    packageUnit: r.package_unit,
    imageUrl: r.image_url,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const byIdStmt = db.prepare(`SELECT ${COLS} FROM products WHERE id = ?`);
const insertStmt = db.prepare(
  `INSERT INTO products (${COLS})
   VALUES (@id,@name,@brand,@barcode,@categoryId,@defaultLocationId,@packageQuantity,@packageUnit,@imageUrl,@createdAt,@updatedAt)`,
);

export function getProduct(id: string): Product | undefined {
  const r = byIdStmt.get(id) as ProductRow | undefined;
  return r ? toProduct(r) : undefined;
}

/** All products, for the receipt matcher to score against (households are small). */
export function allProducts(): Product[] {
  return (db.prepare(`SELECT ${COLS} FROM products`).all() as ProductRow[]).map(toProduct);
}

export function createProduct(input: ProductInput): Product {
  const now = new Date().toISOString();
  const id = newId();
  insertStmt.run({
    id,
    name: input.name,
    brand: input.brand ?? null,
    barcode: input.barcode ?? null,
    categoryId: input.categoryId,
    defaultLocationId: input.defaultLocationId ?? null,
    packageQuantity: input.packageQuantity ?? null,
    packageUnit: input.packageUnit ?? null,
    imageUrl: input.imageUrl ?? null,
    createdAt: now,
    updatedAt: now,
  });
  return getProduct(id) as Product;
}

/** Find an existing identity (barcode wins; else case-insensitive name+brand) or
 *  create it. This is the join point receipts and barcode add both rely on. */
export function findOrCreateProduct(input: ProductInput): Product {
  const barcode = input.barcode?.trim();
  if (barcode) {
    const r = db.prepare(`SELECT ${COLS} FROM products WHERE barcode = ?`).get(barcode) as
      ProductRow | undefined;
    if (r) return toProduct(r);
  } else {
    const r = db
      .prepare(
        `SELECT ${COLS} FROM products
         WHERE barcode IS NULL AND lower(name) = lower(?) AND lower(COALESCE(brand,'')) = lower(?)`,
      )
      .get(input.name, input.brand ?? "") as ProductRow | undefined;
    if (r) return toProduct(r);
  }
  return createProduct(input);
}

const PATCH_COLS: Record<string, string> = {
  name: "name",
  brand: "brand",
  barcode: "barcode",
  categoryId: "category_id",
  defaultLocationId: "default_location_id",
  packageQuantity: "package_quantity",
  packageUnit: "package_unit",
  imageUrl: "image_url",
};

export function updateProduct(id: string, patch: ProductPatch): Product | undefined {
  const sets: string[] = [];
  const vals: Array<string | number | null> = [];
  const p = patch as Record<string, unknown>;
  for (const [key, col] of Object.entries(PATCH_COLS)) {
    if (p[key] === undefined) continue;
    sets.push(`${col} = ?`);
    vals.push((p[key] as string | number | null) ?? null);
  }
  if (sets.length === 0) return getProduct(id);
  sets.push("updated_at = ?");
  vals.push(new Date().toISOString(), id);
  const info = db.prepare(`UPDATE products SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  return info.changes ? getProduct(id) : undefined;
}
