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
  FoodGuidanceSuggestion,
  DietaryRequirement,
  StockLotCreateInput,
  ActivityEntry,
  UsageInsights,
} from "@eatme/shared";

export type ReceiptSummary = {
  purchaseId: string;
  added: number;
  ignored: number;
  notTracked: number;
  newProducts: number;
};

export type Settings = {
  household_timezone: string;
  dietary_requirements: DietaryRequirement[];
  magtag_stale_hours: number;
  magtag_low_battery: number;
  ha_shopping_sync: boolean;
  backup_retention: number;
};

export type MagtagHealth = {
  configured: boolean;
  status: {
    battery: number | null;
    wakeReason: string | null;
    firmware: string | null;
    rssi: number | null;
    displayUpdated: boolean | null;
    wakeSeconds: number | null;
    reportedAt: string;
  } | null;
  lastButton: { button: string; at: string } | null;
  staleHours: number;
  lowBattery: number;
  isStale: boolean;
  isLowBattery: boolean;
};

export type HomeAssistantStatus = {
  available: boolean;
  shoppingSyncEnabled: boolean;
  lastSync: string | null;
  lastError: string | null;
  synced?: boolean;
};

export type DatabaseIntegrity = {
  ok: boolean;
  quickCheck: string;
  foreignKeyErrors: number;
};

export type AutomaticBackupStatus = {
  retention: number;
  count: number;
  latest: { createdAt: string; size: number } | null;
};

export type StarterRecipe = RecipeInput & {
  key: string;
  alreadyImported: boolean;
};

export type LabelContainer = Container & {
  displayName: string;
  productName: string | null;
  locationName: string | null;
};

export type OffResult = {
  found: boolean;
  barcode: string;
  name?: string;
  brand?: string;
  size?: string;
  imageUrl?: string;
  categoryHints?: string[];
};

/** What the Add screen sends; the server fills defaults + find-or-creates the product. */
export type IntakeBody = {
  name: string;
  brand?: string;
  barcode?: string;
  categoryId?: string;
  locationId?: string;
  categoryHints?: string[];
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

async function htmlReq(path: string): Promise<string> {
  const res = await fetch("/api" + path, {
    headers: {
      accept: "text/html",
      ...(authToken() ? { authorization: `Bearer ${authToken()}` } : {}),
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
  }
  return res.text();
}

async function downloadReq(path: string): Promise<void> {
  const res = await fetch("/api" + path, {
    headers: {
      ...(authToken() ? { authorization: `Bearer ${authToken()}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  const disposition = res.headers.get("content-disposition") ?? "";
  const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? "eatme-export";
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
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

  createLot: (input: StockLotCreateInput) =>
    req<StockLot>("/stock-lots", { method: "POST", body: JSON.stringify(input) }),
  patchLot: (id: string, patch: StockLotPatch) =>
    req<StockLot>(`/stock-lots/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  archiveLot: (id: string, reason?: ArchiveReason) =>
    req<StockLot>(`/stock-lots/${id}/archive`, {
      method: "POST",
      ...(reason ? { body: JSON.stringify({ reason }) } : {}),
    }),
  restoreLot: (id: string) => req<StockLot>(`/stock-lots/${id}/restore`, { method: "POST" }),
  postLotEvent: (id: string, event: EventInput) =>
    req<StockLot>(`/stock-lots/${id}/events`, { method: "POST", body: JSON.stringify(event) }),

  getQr: (qrUid: string) =>
    req<{ container: Container; lot: StockLot | null; product: Product | null }>(
      `/qr/${encodeURIComponent(qrUid)}`,
    ),
  labelContainers: (productId?: string) =>
    req<LabelContainer[]>(
      `/labels/containers${productId ? `?productId=${encodeURIComponent(productId)}` : ""}`,
    ),
  labelSheet: (ids: string[]) => htmlReq(`/labels?ids=${encodeURIComponent(ids.join(","))}`),

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
  guidance: (input: {
    name: string;
    brand?: string;
    categoryHints?: string[];
    purchasedAt?: string;
  }) => {
    const query = new URLSearchParams({ name: input.name });
    if (input.brand) query.set("brand", input.brand);
    if (input.purchasedAt) query.set("purchasedAt", input.purchasedAt);
    for (const hint of input.categoryHints ?? []) query.append("categoryHint", hint);
    return req<FoodGuidanceSuggestion>(`/guidance?${query}`);
  },
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
  starterRecipes: () =>
    req<{ requirements: DietaryRequirement[]; recipes: StarterRecipe[] }>("/recipes/starter-pack"),
  importStarterRecipes: () =>
    req<{
      added: number;
      alreadyImported: number;
      requirements: DietaryRequirement[];
    }>("/recipes/starter-pack/import", { method: "POST" }),
  shopMissing: (id: string) =>
    req<{ added: string[]; skipped: number }>(`/recipes/${id}/shop-missing`, { method: "POST" }),
  markCooked: (id: string) => req<{ used: string[] }>(`/recipes/${id}/cooked`, { method: "POST" }),

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

  // web push
  pushPublicKey: () => req<{ publicKey: string; subscribers: number }>("/push/public-key"),
  pushSubscribe: (sub: { endpoint: string; keys: Record<string, string> }) =>
    req<{ id: string }>("/push/subscribe", { method: "POST", body: JSON.stringify(sub) }),
  pushUnsubscribe: (endpoint: string) =>
    req<{ removed: boolean }>("/push/unsubscribe", {
      method: "POST",
      body: JSON.stringify({ endpoint }),
    }),
  pushTest: () =>
    req<{ sent: number; pruned: number; failed: number }>("/push/test", { method: "POST" }),

  getSettings: () => req<Settings>("/settings"),
  putSettings: (patch: Partial<Settings>) =>
    req<Settings>("/settings", { method: "PUT", body: JSON.stringify(patch) }),

  // history, insights, device health, backups, and Home Assistant
  activity: (limit = 50) => req<ActivityEntry[]>(`/activity?limit=${limit}`),
  insights: (days = 90) => req<UsageInsights>(`/insights?days=${days}`),
  magtagHealth: () => req<MagtagHealth>("/magtag/health"),
  databaseIntegrity: () => req<DatabaseIntegrity>("/maintenance/integrity"),
  automaticBackups: () => req<AutomaticBackupStatus>("/maintenance/automatic-backups"),
  createAutomaticBackup: () =>
    req<AutomaticBackupStatus>("/maintenance/automatic-backups", { method: "POST" }),
  downloadLatestAutomaticBackup: () => downloadReq("/maintenance/automatic-backups/latest"),
  downloadBackup: () => downloadReq("/maintenance/backup"),
  downloadInventoryCsv: () => downloadReq("/maintenance/inventory.csv"),
  restoreBackup: (backup: unknown) =>
    req<{ rows: number }>("/maintenance/restore", {
      method: "POST",
      body: JSON.stringify(backup),
    }),
  homeAssistantStatus: () => req<HomeAssistantStatus>("/home-assistant"),
  syncHomeAssistant: () => req<HomeAssistantStatus>("/home-assistant/sync", { method: "POST" }),
};

/** True for a fetch aborted by an AbortController (a superseded request) — the
 *  caller should swallow it silently rather than surfacing it as an error. */
export function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}
