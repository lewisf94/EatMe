import { db } from "../db.js";
import { config } from "../config.js";

export type OffResult = {
  found: boolean;
  barcode: string;
  name?: string;
  brand?: string;
  size?: string;
  imageUrl?: string;
};

/** Pure mapper from an Open Food Facts v2 response to our shape (unit-tested). */
export function mapOff(barcode: string, json: unknown): OffResult {
  const j = json as { status?: number; product?: Record<string, string> } | null;
  if (!j || j.status === 0 || !j.product) return { found: false, barcode };
  const p = j.product;
  return {
    found: true,
    barcode,
    name: p.product_name || undefined,
    brand: p.brands || undefined,
    size: p.quantity || undefined,
    imageUrl: p.image_front_small_url || undefined,
  };
}

const DAY = 86_400_000;

/** Cache TTL: hits last ~30 days; misses only ~3 (a product added to OFF
 *  tomorrow, or a corrected name, should be picked up soon). Pure → unit-tested. */
export function cacheIsFresh(found: boolean, fetchedAt: string, now = Date.now()): boolean {
  return now - Date.parse(fetchedAt) < (found ? 30 : 3) * DAY;
}

/** Look up a barcode, serving from a fresh local cache first (statements are lazy
 *  so importing this module for `mapOff` never touches the DB schema). */
export async function lookup(barcode: string): Promise<OffResult> {
  const cached = db
    .prepare("SELECT off_json, fetched_at FROM lookup_cache WHERE barcode = ?")
    .get(barcode) as { off_json: string; fetched_at: string } | undefined;
  const cachedResult = cached ? mapOff(barcode, JSON.parse(cached.off_json)) : null;
  if (cached && cachedResult && cacheIsFresh(cachedResult.found, cached.fetched_at)) {
    return cachedResult;
  }

  const url =
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json` +
    `?fields=product_name,brands,quantity,image_front_small_url`;
  let json: unknown;
  try {
    const res = await fetch(url, { headers: { "User-Agent": config.offUserAgent } });
    if (res.status === 503) throw new Error("Open Food Facts rate-limited; try again shortly");
    if (!res.ok) throw new Error(`Open Food Facts returned HTTP ${res.status}`);
    json = await res.json();
  } catch (err) {
    // Network/parse failure: fall back to a stale cache entry if we have one.
    if (cachedResult) return cachedResult;
    throw err instanceof Error ? err : new Error("Open Food Facts lookup failed");
  }

  db.prepare(
    "INSERT OR REPLACE INTO lookup_cache (barcode, off_json, fetched_at) VALUES (?, ?, ?)"
  ).run(barcode, JSON.stringify(json), new Date().toISOString());
  return mapOff(barcode, json);
}
