import { db } from "../db.js";
import { config } from "../config.js";

export type OffResult = {
  found: boolean;
  barcode: string;
  name?: string;
  brand?: string;
  size?: string;
  imageUrl?: string;
  categoryHints?: string[];
};

/** Pure mapper from an Open Food Facts v2 response to our shape (unit-tested). */
export function mapOff(barcode: string, json: unknown): OffResult {
  const j = json as {
    status?: number;
    product?: Record<string, string | string[] | undefined>;
  } | null;
  if (!j || j.status === 0 || !j.product) return { found: false, barcode };
  const p = j.product;
  const seenCategories = new Set<string>();
  const categoryHints = [
    ...(Array.isArray(p.categories_tags) ? p.categories_tags : []),
    ...(typeof p.categories === "string" ? p.categories.split(",") : []),
  ]
    .map((value) =>
      value
        .replace(/^[a-z]{2}:/, "")
        .replace(/-/g, " ")
        .trim(),
    )
    .filter((value) => {
      const key = value.toLowerCase();
      if (!value || seenCategories.has(key)) return false;
      seenCategories.add(key);
      return true;
    });
  return {
    found: true,
    barcode,
    name: typeof p.product_name === "string" ? p.product_name || undefined : undefined,
    brand: typeof p.brands === "string" ? p.brands || undefined : undefined,
    size: typeof p.quantity === "string" ? p.quantity || undefined : undefined,
    imageUrl:
      typeof p.image_front_small_url === "string"
        ? p.image_front_small_url || undefined
        : undefined,
    categoryHints: categoryHints.length ? categoryHints.slice(0, 20) : undefined,
  };
}

const DAY = 86_400_000;
const OFF_TIMEOUT_MS = 10_000;
const inFlight = new Map<string, Promise<OffResult>>();

/** Cache TTL: hits last ~30 days; misses only ~3 (a product added to OFF
 *  tomorrow, or a corrected name, should be picked up soon). Pure → unit-tested. */
export function cacheIsFresh(found: boolean, fetchedAt: string, now = Date.now()): boolean {
  return now - Date.parse(fetchedAt) < (found ? 30 : 3) * DAY;
}

/** Look up a barcode, serving from a fresh local cache first (statements are lazy
 *  so importing this module for `mapOff` never touches the DB schema). */
async function lookupOnce(barcode: string): Promise<OffResult> {
  const cached = db
    .prepare("SELECT off_json, fetched_at FROM lookup_cache WHERE barcode = ?")
    .get(barcode) as { off_json: string; fetched_at: string } | undefined;
  let cachedResult: OffResult | null = null;
  if (cached) {
    try {
      cachedResult = mapOff(barcode, JSON.parse(cached.off_json));
    } catch {
      // A damaged cache entry should be replaceable by the upstream response,
      // not permanently break every future lookup for this barcode.
    }
  }
  if (cached && cachedResult && cacheIsFresh(cachedResult.found, cached.fetched_at)) {
    return cachedResult;
  }

  const url =
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json` +
    `?fields=product_name,brands,quantity,image_front_small_url,categories,categories_tags`;
  let json: unknown;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": config.offUserAgent },
      signal: AbortSignal.timeout(OFF_TIMEOUT_MS),
    });
    if (res.status === 503) throw new Error("Open Food Facts rate-limited; try again shortly");
    if (!res.ok) throw new Error(`Open Food Facts returned HTTP ${res.status}`);
    json = await res.json();
  } catch (err) {
    // Network/parse failure: fall back to a stale cache entry if we have one.
    if (cachedResult) return cachedResult;
    throw err instanceof Error ? err : new Error("Open Food Facts lookup failed");
  }

  db.prepare(
    "INSERT OR REPLACE INTO lookup_cache (barcode, off_json, fetched_at) VALUES (?, ?, ?)",
  ).run(barcode, JSON.stringify(json), new Date().toISOString());
  return mapOff(barcode, json);
}

/** Share one upstream request when camera scans or UI retries ask for the same
 * uncached barcode concurrently. This reduces latency, traffic and OFF rate
 * limiting without changing cache semantics. */
export function lookup(barcode: string): Promise<OffResult> {
  const current = inFlight.get(barcode);
  if (current) return current;
  const pending = lookupOnce(barcode).finally(() => inFlight.delete(barcode));
  inFlight.set(barcode, pending);
  return pending;
}
