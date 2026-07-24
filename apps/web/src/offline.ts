// Offline layer: an IndexedDB snapshot the app can read instantly with no signal,
// plus an op-id'd outbox for writes made while offline that replays exactly once.
//
// The service worker precaches the app shell but deliberately never caches /api,
// so this module owns all offline data. Reads fall back to the last snapshot;
// writes fall back to a queue. Every queued write carries a client op-id and the
// server dedupes on it (idempotent), so replaying twice still applies once.
import { useSyncExternalStore } from "react";
import type { InventoryRow, EventInput, Product, StockLot } from "@eatme/shared";
import { STATUS_SEVERITY } from "@eatme/shared";
import { api, isAbort } from "./api";

// ---------------------------------------------------------------- IndexedDB ---
const DB_NAME = "eatme";
const DB_VERSION = 1;
let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (!dbPromise)
    dbPromise = new Promise((resolve, reject) => {
      const open = indexedDB.open(DB_NAME, DB_VERSION);
      open.onupgradeneeded = () => {
        const d = open.result;
        if (!d.objectStoreNames.contains("kv")) d.createObjectStore("kv");
        if (!d.objectStoreNames.contains("outbox"))
          d.createObjectStore("outbox", { keyPath: "opId" });
      };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
  return dbPromise;
}

function withStore<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        let req: IDBRequest<T>;
        try {
          req = run(d.transaction(store, mode).objectStore(store));
        } catch (e) {
          reject(e);
          return;
        }
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

const kvGet = <T>(key: string) =>
  withStore<T | undefined>("kv", "readonly", (s) => s.get(key) as IDBRequest<T | undefined>);
const kvSet = (key: string, val: unknown) =>
  withStore<IDBValidKey>("kv", "readwrite", (s) => s.put(val, key));
const outboxGetAll = () =>
  withStore<PendingOp[]>("outbox", "readonly", (s) => s.getAll() as IDBRequest<PendingOp[]>);
const outboxPut = (op: PendingOp) =>
  withStore<IDBValidKey>("outbox", "readwrite", (s) => s.put(op));
const outboxDelete = (opId: string) =>
  withStore<undefined>("outbox", "readwrite", (s) => s.delete(opId) as IDBRequest<undefined>);

// ------------------------------------------------------------------- outbox ---
export type PendingOp = {
  opId: string;
  kind: "lotEvent";
  lotId: string;
  productId: string;
  label: string; // product name, for a human-readable "waiting to sync" note
  event: EventInput; // carries the same opId, so the server dedupes on replay
  enqueuedAt: string;
};

// A synchronous in-memory mirror of the outbox so React can read pending state
// without awaiting IndexedDB (useSyncExternalStore needs a sync snapshot).
let pending: PendingOp[] = [];
const listeners = new Set<() => void>();
function emit() {
  for (const l of listeners) l();
}
async function refreshPending() {
  const all = await outboxGetAll();
  pending = all.sort((a, b) => a.enqueuedAt.localeCompare(b.enqueuedAt));
  emit();
}

export function subscribePending(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
export function pendingSnapshot(): PendingOp[] {
  return pending;
}
/** React hook: the current queue of unsynced writes (stable until it changes). */
export function usePending(): PendingOp[] {
  return useSyncExternalStore(subscribePending, pendingSnapshot, pendingSnapshot);
}
/** Lot ids with a queued change, so the product page can mark them visibly. */
export function pendingLotIds(): Set<string> {
  return new Set(pending.map((p) => p.lotId));
}

// --------------------------------------------------------------- read cache ---
const CANON_QUERY = "?sort=urgency"; // the full, unfiltered snapshot we cache

/** Worst-first, then soonest — mirrors the server's urgency sort for offline. */
function filterSort(rows: InventoryRow[], query: string): InventoryRow[] {
  const q = new URLSearchParams(query.replace(/^\?/, "")).get("q")?.trim().toLowerCase();
  const matched = q
    ? rows.filter((r) => `${r.name} ${r.brand ?? ""}`.toLowerCase().includes(q))
    : rows;
  return [...matched].sort(
    (a, b) =>
      STATUS_SEVERITY[b.status] - STATUS_SEVERITY[a.status] ||
      (a.daysLeft ?? 1e9) - (b.daysLeft ?? 1e9) ||
      a.name.localeCompare(b.name),
  );
}

export type Loaded<T> = T & { offline: boolean; syncedAt: number | null };

/** Inventory with an offline fallback: network first (and cache the full list),
 *  else the last snapshot filtered/sorted client-side so search still works. */
export async function loadInventory(
  query = CANON_QUERY,
  signal?: AbortSignal,
): Promise<Loaded<{ rows: InventoryRow[] }>> {
  try {
    const rows = await api.inventory(query, signal);
    if (!query.includes("q=")) {
      await kvSet("inventory", rows);
      await kvSet("syncedAt", Date.now());
    }
    return { rows, offline: false, syncedAt: (await kvGet<number>("syncedAt")) ?? null };
  } catch (e) {
    if (isAbort(e) || !(e instanceof TypeError)) throw e; // abort or real server error
    const cached = (await kvGet<InventoryRow[]>("inventory")) ?? [];
    return {
      rows: filterSort(cached, query),
      offline: true,
      syncedAt: (await kvGet<number>("syncedAt")) ?? null,
    };
  }
}

type ProductBundle = { product: Product; lots: StockLot[] };

/** A single product with an offline fallback, with any queued lot changes
 *  applied on top so the cached view reflects what you did while offline. */
export async function loadProduct(id: string): Promise<Loaded<ProductBundle> | null> {
  try {
    const bundle = await api.getProduct(id);
    await kvSet(`product:${id}`, bundle);
    return { ...bundle, offline: false, syncedAt: (await kvGet<number>("syncedAt")) ?? null };
  } catch (e) {
    if (!(e instanceof TypeError)) throw e;
    const cached = await kvGet<ProductBundle>(`product:${id}`);
    if (!cached) return null;
    return {
      product: cached.product,
      lots: cached.lots.map(applyQueued),
      offline: true,
      syncedAt: (await kvGet<number>("syncedAt")) ?? null,
    };
  }
}

/** Overlay any queued events for a lot onto its cached copy (last-write-wins). */
function applyQueued(lot: StockLot): StockLot {
  let next = lot;
  for (const op of pending.filter((p) => p.lotId === lot.id)) {
    if (op.event.event === "opened") next = { ...next, openedAt: next.openedAt ?? nowDate() };
    if (op.event.fractionAfter != null) next = { ...next, fractionLeft: op.event.fractionAfter };
  }
  return next;
}
const nowDate = () => new Date().toISOString().slice(0, 10);

// ----------------------------------------------------------------- mutations ---
/** Post a lot event, or queue it if the network is down. Returns whether it was
 *  queued so the caller can reassure the user it'll sync later. */
export async function submitLotEvent(
  lotId: string,
  productId: string,
  label: string,
  event: EventInput,
): Promise<{ queued: boolean; lot?: StockLot }> {
  const withOp: EventInput = { ...event, opId: event.opId ?? crypto.randomUUID() };
  try {
    const lot = await api.postLotEvent(lotId, withOp);
    return { queued: false, lot };
  } catch (e) {
    if (!(e instanceof TypeError)) throw e; // real server error — surface it
    await outboxPut({
      opId: withOp.opId!,
      kind: "lotEvent",
      lotId,
      productId,
      label,
      event: withOp,
      enqueuedAt: new Date().toISOString(),
    });
    await patchCachedLot(productId, lotId, withOp);
    await refreshPending();
    return { queued: true };
  }
}

/** Keep the cached product in step with a queued change, so reopening the
 *  product offline shows the new amount immediately. */
async function patchCachedLot(productId: string, lotId: string, event: EventInput) {
  const cached = await kvGet<ProductBundle>(`product:${productId}`);
  if (!cached) return;
  const lots = cached.lots.map((l) =>
    l.id !== lotId
      ? l
      : {
          ...l,
          ...(event.fractionAfter != null ? { fractionLeft: event.fractionAfter } : {}),
          ...(event.event === "opened" ? { openedAt: l.openedAt ?? nowDate() } : {}),
        },
  );
  await kvSet(`product:${productId}`, { ...cached, lots });
}

/** Drain the outbox in order. Stops on the first network failure (still offline)
 *  and keeps the rest; drops an op the server rejects so it can't wedge the queue.
 *  Idempotent by op-id, so a double replay still applies each change once. */
export async function replayOutbox(): Promise<number> {
  await refreshPending();
  let applied = 0;
  for (const op of [...pending]) {
    try {
      await api.postLotEvent(op.lotId, op.event);
      await outboxDelete(op.opId);
      applied++;
    } catch (e) {
      if (e instanceof TypeError) break; // still offline — leave the queue intact
      await outboxDelete(op.opId); // server rejected it (e.g. lot gone) — drop it
    }
  }
  await refreshPending();
  if (applied > 0) {
    try {
      await kvSet("inventory", await api.inventory(CANON_QUERY));
      await kvSet("syncedAt", Date.now());
    } catch {
      /* refresh is best-effort */
    }
  }
  return applied;
}

// Auto-replay when connectivity returns, and prime the pending mirror on boot.
if (typeof window !== "undefined") {
  window.addEventListener("online", () => void replayOutbox());
  void refreshPending().then(() => {
    if (navigator.onLine) void replayOutbox();
  });
}
