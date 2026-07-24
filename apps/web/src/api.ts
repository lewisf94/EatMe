import type {
  Product,
  ProductPatch,
  StockLot,
  StockLotPatch,
  Container,
  Category,
  CategoryPatch,
  Location,
  LocationPatch,
  EventInput,
  ArchiveReason,
  InventoryRow,
  DateType,
  ReceiptDraft,
  ReceiptConfirmInput,
  Recipe,
  RecipeInput,
  RecipePatch,
  ShoppingItem,
  UseItUpHit,
} from "@eatme/shared";

export type ReceiptSummary = {
  purchaseId: string;
  added: number;
  ignored: number;
  notTracked: number;
  newProducts: number;
};

export type Settings = { household_timezone: string };

export type OffResult = {
  found: boolean;
  barcode: string;
  name?: string;
  brand?: string;
  size?: string;
  imageUrl?: string;
};

/** What the Add screen sends; the server fills defaults + find-or-creates the product. */
export type IntakeBody = {
  name: string;
  brand?: string;
  barcode?: string;
  categoryId: string;
  locationId: string;
  count?: number;
  fractionLeft?: number;
  dateType?: DateType;
  dateValue?: string;
  openedAt?: string;
  openLifeDaysOverride?: number;
};

export const TOKEN_KEY = "eatme_token";
const authToken = () => localStorage.getItem(TOKEN_KEY) || "";

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch("/api" + path, {
    ...opts,
    headers: {
      // Only set JSON content-type when there's a body — Fastify 400s an empty
      // body that declares application/json (e.g. the bodyless archive POST).
      ...(opts?.body != null ? { "content-type": "application/json" } : {}),
      // Sent only when the add-on's optional auth_token is configured.
      ...(authToken() ? { authorization: `Bearer ${authToken()}` } : {}),
      ...(opts?.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => null)) as {
    data?: T;
    error?: { message?: string };
  } | null;
  if (!res.ok) throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
  return (body as { data: T }).data;
}

export const api = {
  // cupboard: aggregated product rows
  inventory: (query = "", signal?: AbortSignal) =>
    req<InventoryRow[]>(`/inventory${query}`, { signal }),
  // add stock: find-or-create product → lot → container, in one call
  intake: (input: IntakeBody) =>
    req<{ product: Product; lot: StockLot; container: Container }>("/intake", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  getProduct: (id: string) => req<{ product: Product; lots: StockLot[] }>(`/products/${id}`),
  patchProduct: (id: string, patch: ProductPatch) =>
    req<Product>(`/products/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  createLot: (input: { productId: string; locationId: string } & Partial<StockLot>) =>
    req<StockLot>("/stock-lots", { method: "POST", body: JSON.stringify(input) }),
  patchLot: (id: string, patch: StockLotPatch) =>
    req<StockLot>(`/stock-lots/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  archiveLot: (id: string, reason?: ArchiveReason) =>
    req<StockLot>(`/stock-lots/${id}/archive`, {
      method: "POST",
      ...(reason ? { body: JSON.stringify({ reason }) } : {}),
    }),
  postLotEvent: (id: string, event: EventInput) =>
    req<StockLot>(`/stock-lots/${id}/events`, { method: "POST", body: JSON.stringify(event) }),

  getQr: (qrUid: string) =>
    req<{ container: Container; lot: StockLot | null; product: Product | null }>(
      `/qr/${encodeURIComponent(qrUid)}`,
    ),

  // receipts: upload raw image bytes → reviewable draft → confirm → stock lots
  uploadReceipt: (image: Blob) =>
    req<ReceiptDraft>("/receipts", {
      method: "POST",
      body: image,
      headers: { "content-type": "application/octet-stream" },
    }),
  getReceipt: (id: string) => req<ReceiptDraft>(`/receipts/${id}`),
  confirmReceipt: (id: string, body: ReceiptConfirmInput) =>
    req<ReceiptSummary>(`/receipts/${id}/confirm`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  lookup: (barcode: string) => req<OffResult>(`/lookup/${encodeURIComponent(barcode)}`),
  categories: () => req<Category[]>("/categories"),
  locations: () => req<Location[]>("/locations"),
  createCategory: (input: { name: string; openLifeDays?: number | null; warnDays?: number }) =>
    req<Category>("/categories", { method: "POST", body: JSON.stringify(input) }),
  patchCategory: (id: string, patch: CategoryPatch) =>
    req<Category>(`/categories/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  createLocation: (input: { name: string; sortOrder?: number }) =>
    req<Location>("/locations", { method: "POST", body: JSON.stringify(input) }),
  patchLocation: (id: string, patch: LocationPatch) =>
    req<Location>(`/locations/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  // recipes: what to cook with the things about to go off
  recipes: () => req<Recipe[]>("/recipes"),
  useItUp: () => req<{ expiring: InventoryRow[]; recipes: UseItUpHit[] }>("/recipes/use-it-up"),
  createRecipe: (input: RecipeInput) =>
    req<Recipe>("/recipes", { method: "POST", body: JSON.stringify(input) }),
  patchRecipe: (id: string, patch: RecipePatch) =>
    req<Recipe>(`/recipes/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteRecipe: (id: string) => req<{ ok: true }>(`/recipes/${id}`, { method: "DELETE" }),

  // shopping list: what's finished and needs buying again
  shopping: (includeDone = false) =>
    req<ShoppingItem[]>(`/shopping-list${includeDone ? "?includeDone=1" : ""}`),
  addShopping: (input: { name?: string; productId?: string }) =>
    req<ShoppingItem>("/shopping-list", { method: "POST", body: JSON.stringify(input) }),
  tickShopping: (id: string) =>
    req<{ item: ShoppingItem; lot: StockLot | null }>(`/shopping-list/${id}/done`, {
      method: "POST",
    }),
  untickShopping: (id: string) =>
    req<ShoppingItem>(`/shopping-list/${id}/undone`, { method: "POST" }),
  deleteShopping: (id: string) => req<{ ok: true }>(`/shopping-list/${id}`, { method: "DELETE" }),

  getSettings: () => req<Settings>("/settings"),
  putSettings: (patch: Partial<Settings>) =>
    req<Settings>("/settings", { method: "PUT", body: JSON.stringify(patch) }),
};

/** True for a fetch aborted by an AbortController (a superseded request) — the
 *  caller should swallow it silently rather than surfacing it as an error. */
export function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}
