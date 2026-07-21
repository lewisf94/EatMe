import type {
  Item,
  ItemInput,
  ItemPatch,
  Category,
  CategoryPatch,
  Location,
  LocationPatch,
  EventInput,
  ArchiveReason,
  Status,
} from "@whattoeat/shared";

export type Settings = { household_timezone: string };

export type ItemWithStatus = Item & {
  status: Status;
  pressureDate: string | null;
  daysLeft: number | null;
};

export type OffResult = {
  found: boolean;
  barcode: string;
  name?: string;
  brand?: string;
  size?: string;
  imageUrl?: string;
};

export const TOKEN_KEY = "whattoeat_token";
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
  listItems: (query = "", signal?: AbortSignal) =>
    req<ItemWithStatus[]>(`/items${query}`, { signal }),
  getItem: (id: string) => req<Item>(`/items/${id}`),
  createItem: (input: ItemInput) =>
    req<Item>("/items", { method: "POST", body: JSON.stringify(input) }),
  patchItem: (id: string, patch: ItemPatch) =>
    req<Item>(`/items/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  archiveItem: (id: string, reason?: ArchiveReason) =>
    req<Item>(`/items/${id}/archive`, {
      method: "POST",
      ...(reason ? { body: JSON.stringify({ reason }) } : {}),
    }),
  postEvent: (id: string, event: EventInput) =>
    req<Item>(`/items/${id}/events`, { method: "POST", body: JSON.stringify(event) }),
  lookup: (barcode: string) => req<OffResult>(`/lookup/${encodeURIComponent(barcode)}`),
  categories: () => req<Category[]>("/categories"),
  locations: () => req<Location[]>("/locations"),
  createCategory: (input: {
    name: string;
    openLifeDays?: number | null;
    warnDays?: number;
    hardExpiry?: boolean;
  }) => req<Category>("/categories", { method: "POST", body: JSON.stringify(input) }),
  patchCategory: (id: string, patch: CategoryPatch) =>
    req<Category>(`/categories/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  createLocation: (input: { name: string; sortOrder?: number }) =>
    req<Location>("/locations", { method: "POST", body: JSON.stringify(input) }),
  patchLocation: (id: string, patch: LocationPatch) =>
    req<Location>(`/locations/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  getSettings: () => req<Settings>("/settings"),
  putSettings: (patch: Partial<Settings>) =>
    req<Settings>("/settings", { method: "PUT", body: JSON.stringify(patch) }),
};

/** True for a fetch aborted by an AbortController (a superseded request) — the
 *  caller should swallow it silently rather than surfacing it as an error. */
export function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}
