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

// --- products ----------------------------------------------------------
// Reusable identity ("Tesco chickpeas 400 g"). Receipts and barcodes resolve to
// a product; the physical packs you own are stock lots (below).
export const ProductInput = z.object({
  name: z.string().min(1),
  brand: z.string().optional(),
  barcode: z.string().optional(),
  categoryId: z.string().min(1),
  defaultLocationId: z.string().optional(),
  packageQuantity: z.number().positive().optional(),
  packageUnit: z.string().optional(),
  imageUrl: z.string().optional(),
});
export type ProductInput = z.infer<typeof ProductInput>;

// null clears an optional field (JSON drops undefined, so a cleared value is null)
export const ProductPatch = ProductInput.partial().extend({
  brand: z.string().nullable().optional(),
  barcode: z.string().nullable().optional(),
  defaultLocationId: z.string().nullable().optional(),
  packageQuantity: z.number().positive().nullable().optional(),
  packageUnit: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
});
export type ProductPatch = z.infer<typeof ProductPatch>;

export const Product = z.object({
  id: z.string(),
  name: z.string(),
  brand: z.string().nullable(),
  barcode: z.string().nullable(),
  categoryId: z.string(),
  defaultLocationId: z.string().nullable(),
  packageQuantity: z.number().nullable(),
  packageUnit: z.string().nullable(),
  imageUrl: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Product = z.infer<typeof Product>;

// --- stock lots --------------------------------------------------------
// A physical pack/batch you actually own. The date printed on THIS pack decides
// safety vs quality, so it lives here (not on the category).
export const DateType = z.enum(["use_by", "best_before"]);
export type DateType = z.infer<typeof DateType>;

export const StockLotInput = z.object({
  productId: z.string().min(1),
  locationId: z.string().min(1),
  count: z.number().int().positive().default(1),
  fractionLeft: z.number().min(0).max(1).default(1),
  dateType: DateType.optional(),
  dateValue: DATE.optional(),
  openedAt: DATE.optional(),
  openLifeDaysOverride: z.number().int().positive().optional(),
  purchasedAt: DATE.optional(),
  source: z.string().optional(),
});
export type StockLotInput = z.infer<typeof StockLotInput>;

export const StockLotPatch = z.object({
  locationId: z.string().optional(),
  count: z.number().int().positive().optional(),
  fractionLeft: z.number().min(0).max(1).optional(),
  dateType: DateType.nullable().optional(),
  dateValue: DATE.nullable().optional(),
  openedAt: DATE.nullable().optional(),
  openLifeDaysOverride: z.number().int().positive().nullable().optional(),
});
export type StockLotPatch = z.infer<typeof StockLotPatch>;

export const StockLot = z.object({
  id: z.string(),
  productId: z.string(),
  locationId: z.string(),
  count: z.number().int(),
  fractionLeft: z.number(),
  dateType: DateType.nullable(),
  dateValue: z.string().nullable(),
  openedAt: z.string().nullable(),
  openLifeDaysOverride: z.number().nullable(),
  purchasedAt: z.string().nullable(),
  archivedAt: z.string().nullable(),
  archiveReason: z.string().nullable(),
  source: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type StockLot = z.infer<typeof StockLot>;

// --- containers --------------------------------------------------------
// A reusable physical thing with a QR label (a spice jar). Its printed uid
// deep-links to whatever lot currently fills it.
export const Container = z.object({
  id: z.string(),
  qrUid: z.string(),
  name: z.string().nullable(),
  productId: z.string().nullable(),
  locationId: z.string().nullable(),
  currentStockLotId: z.string().nullable(),
});
export type Container = z.infer<typeof Container>;

// --- archive + usage events --------------------------------------------
export const ARCHIVE_REASONS = ["finished", "binned", "duplicate", "mistake", "other"] as const;
export type ArchiveReason = (typeof ARCHIVE_REASONS)[number];
export const ArchiveInput = z.object({ reason: z.enum(ARCHIVE_REASONS).default("other") });
export type ArchiveInput = z.infer<typeof ArchiveInput>;

export const EVENTS = [
  "added",
  "opened",
  "fraction_changed",
  "finished",
  "binned",
  "archived",
  "repurchased",
] as const;

export const EventInput = z.object({
  event: z.enum(EVENTS),
  fractionAfter: z.number().min(0).max(1).optional(),
  opId: z.string().optional(), // client op-id for idempotent offline replay
});
export type EventInput = z.infer<typeof EventInput>;

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

// --- freshness ---------------------------------------------------------
// Safety (use-by) is distinct from quality (best-before / open-life). We never
// call something "expired" unless it carries an explicit use-by date.
export type Status = "ok" | "use_soon" | "past_best" | "quality_declining" | "past_use_by";

/** Worst-wins ordering for rolling several lots up to one product row. */
export const STATUS_SEVERITY: Record<Status, number> = {
  ok: 0,
  use_soon: 1,
  quality_declining: 2,
  past_best: 3,
  past_use_by: 4,
};

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

type Clock = { date: string; kind: DateType | "open_life" };

/**
 * Freshness of a single stock lot from two clocks — the date printed on the pack
 * (typed use-by vs best-before) and the opened-life reminder. If a clock has
 * passed, safety wins (a passed use-by → "past_use_by"); otherwise the nearest
 * upcoming clock drives "use_soon"/"ok". `today` is a civil YYYY-MM-DD.
 * The category's open-life/warn are fallbacks; the lot's own values win.
 */
export function computeStatus(
  lot: {
    dateType: DateType | null;
    dateValue: string | null;
    openedAt: string | null;
    openLifeDaysOverride: number | null;
  },
  category: { openLifeDays: number | null; warnDays: number },
  today: string = civilToday(),
): { status: Status; pressureDate: string | null; daysLeft: number | null } {
  const clocks: Clock[] = [];
  if (lot.dateValue && lot.dateType) clocks.push({ date: lot.dateValue, kind: lot.dateType });

  const openLife = lot.openLifeDaysOverride ?? category.openLifeDays ?? null;
  if (lot.openedAt && openLife != null) {
    const d = new Date(lot.openedAt + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + openLife);
    clocks.push({ date: d.toISOString().slice(0, 10), kind: "open_life" });
  }

  if (clocks.length === 0) return { status: "ok", pressureDate: null, daysLeft: null };

  const msPerDay = 86_400_000;
  const diff = (date: string) =>
    Math.round((Date.parse(date + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / msPerDay);

  const passed = clocks.filter((c) => diff(c.date) < 0);
  if (passed.length > 0) {
    // Safety trumps quality: use_by > best_before > open_life.
    const priority = { use_by: 3, best_before: 2, open_life: 1 } as const;
    const gov = passed.sort((a, b) => priority[b.kind] - priority[a.kind])[0];
    const status: Status =
      gov.kind === "use_by"
        ? "past_use_by"
        : gov.kind === "best_before"
          ? "past_best"
          : "quality_declining";
    return { status, pressureDate: gov.date, daysLeft: diff(gov.date) };
  }

  // Nothing passed → nearest upcoming clock drives the warning window.
  let nearest = clocks[0];
  for (const c of clocks) if (diff(c.date) < diff(nearest.date)) nearest = c;
  const daysLeft = diff(nearest.date);
  return {
    status: daysLeft <= category.warnDays ? "use_soon" : "ok",
    pressureDate: nearest.date,
    daysLeft,
  };
}

// --- inventory rollup --------------------------------------------------
// One aggregated cupboard row per product: its active lots rolled up so the UI
// stays as simple as the single-item list was.
export type InventoryRow = {
  productId: string;
  name: string;
  brand: string | null;
  categoryId: string;
  locationId: string | null;
  lotCount: number;
  totalCount: number;
  fractionLeft: number | null; // the sole lot's fraction when there is exactly one
  status: Status;
  pressureDate: string | null;
  daysLeft: number | null;
  createdAt: string; // newest lot, for the "recent" sort
};

// --- intake ------------------------------------------------------------
// Adding stock in one call: find-or-create the product identity, then a lot.
export const IntakeInput = ProductInput.extend({
  locationId: z.string().min(1),
  count: z.number().int().positive().default(1),
  fractionLeft: z.number().min(0).max(1).default(1),
  dateType: DateType.optional(),
  dateValue: DATE.optional(),
  openedAt: DATE.optional(),
  openLifeDaysOverride: z.number().int().positive().optional(),
  opId: z.string().optional(), // client op-id for idempotent offline replay
});
export type IntakeInput = z.infer<typeof IntakeInput>;

// --- receipts ----------------------------------------------------------
// What a local OCR engine returns (docTR/PaddleOCR/Tesseract all fit this shape).
export type OcrLine = { text: string; confidence?: number };
export type OcrResult = { merchant?: string; purchasedAt?: string; lines: OcrLine[] };

export type ReceiptMatch = {
  productId: string;
  name: string;
  brand: string | null;
  via: "alias" | "exact" | "fuzzy";
};

// One reviewable line: the raw text, a best match (if any), and a few suggestions.
export type ReceiptDraftLine = {
  id: string;
  lineNo: number;
  rawText: string;
  normalizedText: string;
  quantity: number;
  unitPrice: number | null;
  lineTotal: number | null;
  confidence: number | null;
  status: string;
  match: ReceiptMatch | null;
  suggestions: Array<{ productId: string; name: string; brand: string | null }>;
};

export type ReceiptDraft = {
  purchase: { id: string; merchant: string | null; purchasedAt: string | null; status: string };
  lines: ReceiptDraftLine[];
};

// The review screen sends back a decision per line; confirm applies them all in
// one transaction (create stock lots + learn aliases).
export const RECEIPT_ACTIONS = ["add", "ignore", "not_tracked"] as const;
export type ReceiptAction = (typeof RECEIPT_ACTIONS)[number];

export const ReceiptLineDecision = z.object({
  lineId: z.string(),
  action: z.enum(RECEIPT_ACTIONS),
  productId: z.string().optional(), // an existing product to add to
  newProduct: z
    .object({
      name: z.string().min(1),
      categoryId: z.string().min(1),
      brand: z.string().optional(),
    })
    .optional(), // …or create this product
  quantity: z.number().int().positive().default(1),
  locationId: z.string().optional(),
});
export type ReceiptLineDecision = z.infer<typeof ReceiptLineDecision>;

export const ReceiptConfirmInput = z.object({
  defaultLocationId: z.string().optional(),
  lines: z.array(ReceiptLineDecision),
});
export type ReceiptConfirmInput = z.infer<typeof ReceiptConfirmInput>;
