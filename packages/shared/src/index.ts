import { z } from "zod";

// --- ids ---------------------------------------------------------------
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Short URL-safe unique id (base58 over CSPRNG bytes). */
export function newId(len = 12): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let s = "";
  for (const b of bytes) s += B58[b % 58];
  return s;
}

/** Quick-tap fractions the UI offers (Full … Empty). */
export const FRACTIONS = [1, 0.75, 0.5, 0.25, 0.1, 0] as const;

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

// --- items -------------------------------------------------------------
export const ItemInput = z.object({
  name: z.string().min(1),
  brand: z.string().optional(),
  barcode: z.string().optional(),
  categoryId: z.string().min(1),
  locationId: z.string().min(1),
  photoUrl: z.string().optional(),
  notes: z.string().optional(),
  quantityTotal: z.number().positive().optional(),
  unit: z.string().optional(),
  fractionLeft: z.number().min(0).max(1).default(1),
  bestBefore: DATE.optional(),
  openedAt: DATE.optional(),
  openLifeDays: z.number().int().positive().optional(),
});
export type ItemInput = z.infer<typeof ItemInput>;

// Patch allows `null` on optional fields so the client can *clear* them
// (JSON.stringify drops `undefined`, so a cleared value must be sent as null).
export const ItemPatch = ItemInput.partial().extend({
  brand: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  photoUrl: z.string().nullable().optional(),
  unit: z.string().nullable().optional(),
  quantityTotal: z.number().positive().nullable().optional(),
  bestBefore: DATE.nullable().optional(),
  openedAt: DATE.nullable().optional(),
  openLifeDays: z.number().int().positive().nullable().optional(),
});
export type ItemPatch = z.infer<typeof ItemPatch>;

export const ARCHIVE_REASONS = ["finished", "binned", "duplicate", "mistake", "other"] as const;
export type ArchiveReason = (typeof ARCHIVE_REASONS)[number];
export const ArchiveInput = z.object({ reason: z.enum(ARCHIVE_REASONS).default("other") });
export type ArchiveInput = z.infer<typeof ArchiveInput>;

export const Item = ItemInput.extend({
  id: z.string(),
  qrUid: z.string(),
  archivedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Item = z.infer<typeof Item>;

// --- taxonomy ----------------------------------------------------------
export const Category = z.object({
  id: z.string(),
  name: z.string(),
  openLifeDays: z.number().int().positive().nullable(),
  warnDays: z.number().int().nonnegative(),
  hardExpiry: z.boolean(),
});
export type Category = z.infer<typeof Category>;

export const CategoryInput = z.object({
  name: z.string().min(1),
  openLifeDays: z.number().int().positive().nullable().optional(),
  warnDays: z.number().int().nonnegative().default(14),
  hardExpiry: z.boolean().default(false),
});
export type CategoryInput = z.infer<typeof CategoryInput>;

export const CategoryPatch = CategoryInput.partial();
export type CategoryPatch = z.infer<typeof CategoryPatch>;

export const Location = z.object({
  id: z.string(),
  name: z.string(),
  sortOrder: z.number().int(),
});
export type Location = z.infer<typeof Location>;

export const LocationInput = z.object({
  name: z.string().min(1),
  sortOrder: z.number().int().default(0),
});
export type LocationInput = z.infer<typeof LocationInput>;

export const LocationPatch = LocationInput.partial();
export type LocationPatch = z.infer<typeof LocationPatch>;

// --- usage events ------------------------------------------------------
export const EVENTS = [
  "added",
  "opened",
  "fraction_changed",
  "finished",
  "binned",
  "repurchased",
] as const;

export const EventInput = z.object({
  event: z.enum(EVENTS),
  fractionAfter: z.number().min(0).max(1).optional(),
});
export type EventInput = z.infer<typeof EventInput>;

// --- freshness ---------------------------------------------------------
export type Status = "ok" | "use_soon" | "past_best" | "expired";

/** Today's civil date (YYYY-MM-DD) in an IANA timezone — avoids the UTC
 *  off-by-one near local midnight (e.g. BST). `now` is injectable for tests. */
export function civilToday(timeZone = "Europe/London", now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Two clocks — printed best-before and opened-life — the sooner wins.
 * `hardExpiry` categories become "expired" past the date; everything else is
 * "past_best" (a quality, not safety, signal). `today` is a civil YYYY-MM-DD.
 */
export function computeStatus(
  item: Pick<Item, "bestBefore" | "openedAt" | "openLifeDays">,
  category: Pick<Category, "openLifeDays" | "warnDays" | "hardExpiry">,
  today: string = civilToday(),
): { status: Status; pressureDate: string | null; daysLeft: number | null } {
  const dates: string[] = [];
  if (item.bestBefore) dates.push(item.bestBefore);

  const openLife = item.openLifeDays ?? category.openLifeDays ?? null;
  if (item.openedAt && openLife != null) {
    const d = new Date(item.openedAt + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + openLife);
    dates.push(d.toISOString().slice(0, 10));
  }

  if (dates.length === 0) return { status: "ok", pressureDate: null, daysLeft: null };

  dates.sort();
  const pressureDate = dates[0];
  const msPerDay = 86_400_000;
  const daysLeft = Math.round(
    (Date.parse(pressureDate + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / msPerDay,
  );

  let status: Status;
  if (daysLeft < 0) status = category.hardExpiry ? "expired" : "past_best";
  else if (daysLeft <= category.warnDays) status = "use_soon";
  else status = "ok";

  return { status, pressureDate, daysLeft };
}
