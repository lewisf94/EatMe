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

export const ItemPatch = ItemInput.partial();
export type ItemPatch = z.infer<typeof ItemPatch>;

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

/**
 * Two clocks — printed best-before and opened-life — the sooner wins.
 * `hardExpiry` categories become "expired" past the date; everything else is
 * "past_best" (a quality, not safety, signal).
 */
export function computeStatus(
  item: Pick<Item, "bestBefore" | "openedAt" | "openLifeDays">,
  category: Pick<Category, "openLifeDays" | "warnDays" | "hardExpiry">,
  today: Date = new Date(),
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
  const todayStr = today.toISOString().slice(0, 10);
  const daysLeft = Math.round(
    (Date.parse(pressureDate + "T00:00:00Z") - Date.parse(todayStr + "T00:00:00Z")) / msPerDay,
  );

  let status: Status;
  if (daysLeft < 0) status = category.hardExpiry ? "expired" : "past_best";
  else if (daysLeft <= category.warnDays) status = "use_soon";
  else status = "ok";

  return { status, pressureDate, daysLeft };
}
