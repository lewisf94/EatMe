import type {
  Item,
  ItemInput,
  ItemPatch,
  Category,
  Location,
  EventInput,
  Status,
} from "@whattoeat/shared";

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

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch("/api" + path, {
    ...opts,
    headers: {
      // Only set JSON content-type when there's a body — Fastify 400s an empty
      // body that declares application/json (e.g. the bodyless archive POST).
      ...(opts?.body != null ? { "content-type": "application/json" } : {}),
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
  listItems: (query = "") => req<ItemWithStatus[]>(`/items${query}`),
  getItem: (id: string) => req<Item>(`/items/${id}`),
  createItem: (input: ItemInput) =>
    req<Item>("/items", { method: "POST", body: JSON.stringify(input) }),
  patchItem: (id: string, patch: ItemPatch) =>
    req<Item>(`/items/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  archiveItem: (id: string) => req<Item>(`/items/${id}/archive`, { method: "POST" }),
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
  createLocation: (input: { name: string; sortOrder?: number }) =>
    req<Location>("/locations", { method: "POST", body: JSON.stringify(input) }),
};
