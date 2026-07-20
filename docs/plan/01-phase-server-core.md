# P1 · Server core + Open Food Facts lookup

**Goal:** a running Fastify server backed by SQLite with the full item schema, CRUD, and a cached Open Food Facts lookup. No UI yet — proven with `curl`.

**Prerequisites:** none (first phase). Read [00-conventions.md](00-conventions.md) first.

## Deliverables

1. pnpm monorepo skeleton (`apps/server`, `packages/shared`, root config).
2. SQLite schema via a migration runner.
3. `@whattoeat/shared`: zod schemas, types, `newId()`, `computeStatus()`.
4. REST API: items CRUD + search, categories, locations, `/api/lookup/:barcode`, `/api/health`.
5. Seed of sensible default categories & locations on first boot.
6. vitest tests for `computeStatus` and the OFF response mapper.

## Files

```
package.json  pnpm-workspace.yaml  tsconfig.base.json  .gitignore  .prettierrc
packages/shared/{package.json,tsconfig.json,src/index.ts}
apps/server/{package.json,tsconfig.json}
apps/server/src/{index.ts,app.ts,config.ts,db.ts}
apps/server/src/repo/{items.ts,categories.ts,locations.ts,lookupCache.ts}
apps/server/src/routes/{items.ts,taxonomy.ts,lookup.ts,health.ts}
apps/server/src/services/off.ts
apps/server/src/seed.ts
apps/server/migrations/001_init.sql
apps/server/test/{status.test.ts,off.test.ts}
```

## Root scaffolding

`pnpm-workspace.yaml`:
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

Root `package.json`:
```json
{
  "name": "whattoeat",
  "private": true,
  "engines": { "node": ">=24" },
  "packageManager": "pnpm@10.0.0",
  "scripts": {
    "check": "pnpm -r --if-present run check && prettier --check .",
    "test": "pnpm -r --if-present run test",
    "dev": "pnpm --filter @whattoeat/server run dev",
    "format": "prettier --write ."
  },
  "devDependencies": { "prettier": "^3.4.0", "typescript": "^5.9.0" }
}
```

`tsconfig.base.json` — `strict`, `module`/`moduleResolution` `nodenext`, `target` `es2023`, `lib` `["es2023"]`, `declaration` + `composite` for `shared`. Each package `tsconfig.json` extends it. Server `check` script = `tsc --noEmit`; shared `check` = `tsc --noEmit`.

`.gitignore`: `node_modules`, `dist`, `data/`, `*.db*`, `.env`.

## `@whattoeat/shared`

Single entry `src/index.ts`. Everything the server and web both need lives here.

```ts
import { z } from "zod";

// --- ids ---
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function newId(len = 12): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let s = "";
  for (const b of bytes) s += B58[b % 58];
  return s;
}

// --- enums / constants ---
export const FRACTIONS = [1, 0.75, 0.5, 0.25, 0.1, 0] as const;

// --- schemas ---
export const ItemInput = z.object({
  name: z.string().min(1),
  brand: z.string().optional(),
  barcode: z.string().optional(),
  categoryId: z.string(),
  locationId: z.string(),
  photoUrl: z.string().url().optional(),
  notes: z.string().optional(),
  quantityTotal: z.number().positive().optional(),
  unit: z.string().optional(),
  fractionLeft: z.number().min(0).max(1).default(1),
  bestBefore: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // YYYY-MM-DD
  openedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  openLifeDays: z.number().int().positive().optional(),
});
export type ItemInput = z.infer<typeof ItemInput>;

export const Item = ItemInput.extend({
  id: z.string(),
  qrUid: z.string(),
  archivedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Item = z.infer<typeof Item>;

export const Category = z.object({
  id: z.string(), name: z.string(),
  openLifeDays: z.number().int().positive().nullable(),
  warnDays: z.number().int().nonnegative().default(14),
  hardExpiry: z.boolean().default(false),
});
export type Category = z.infer<typeof Category>;

export const Location = z.object({ id: z.string(), name: z.string(), sortOrder: z.number().int() });
export type Location = z.infer<typeof Location>;

// --- freshness ---
export type Status = "ok" | "use_soon" | "past_best" | "expired";
export function computeStatus(
  item: Pick<Item, "bestBefore" | "openedAt" | "openLifeDays">,
  category: Pick<Category, "openLifeDays" | "warnDays" | "hardExpiry">,
  today = new Date()
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
  const pressureDate = dates.sort()[0];
  const msPerDay = 86_400_000;
  const daysLeft = Math.floor(
    (Date.parse(pressureDate + "T00:00:00Z") - Date.parse(today.toISOString().slice(0, 10) + "T00:00:00Z")) / msPerDay
  );
  let status: Status;
  if (daysLeft < 0) status = category.hardExpiry ? "expired" : "past_best";
  else if (daysLeft <= (category.warnDays ?? 14)) status = "use_soon";
  else status = "ok";
  return { status, pressureDate, daysLeft };
}
```

Add a `test/status.test.ts` in shared (or server) covering: no dates → ok; best-before in 3 days → use_soon; opened spice past open-life → past_best; hard-expiry fridge jar past date → expired.

## Migration `001_init.sql`

Implements the [data model](../01-product.md#data-model). Key tables: `locations`, `categories`, `items`, `usage_log`, `lookup_cache`. (Recipes / shopping_list / push_subscriptions come in their own phases' migrations — **do not** create them here.)

```sql
CREATE TABLE _migrations (id INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);

CREATE TABLE locations (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE categories (
  id TEXT PRIMARY KEY, name TEXT NOT NULL,
  open_life_days INTEGER, warn_days INTEGER NOT NULL DEFAULT 14,
  hard_expiry INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE items (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, brand TEXT, barcode TEXT,
  category_id TEXT NOT NULL REFERENCES categories(id),
  location_id TEXT NOT NULL REFERENCES locations(id),
  photo_url TEXT, notes TEXT,
  quantity_total REAL, unit TEXT,
  fraction_left REAL NOT NULL DEFAULT 1,
  best_before TEXT, opened_at TEXT, open_life_days INTEGER,
  qr_uid TEXT NOT NULL UNIQUE,
  archived_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX items_barcode ON items(barcode);
CREATE INDEX items_active ON items(archived_at);

CREATE TABLE usage_log (
  id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES items(id),
  event TEXT NOT NULL, fraction_after REAL, at TEXT NOT NULL
);
CREATE TABLE lookup_cache (
  barcode TEXT PRIMARY KEY, off_json TEXT, fetched_at TEXT NOT NULL
);
```

DB column names are `snake_case`; map to `camelCase` at the repo boundary (write a tiny `rowToItem()` mapper — do not leak snake_case past `repo/`).

## `db.ts` (the pattern every repo follows)

```ts
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.js";

export const db = new DatabaseSync(join(config.dataDir, "whattoeat.db"));
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

export function migrate() {
  db.exec("CREATE TABLE IF NOT EXISTS _migrations (id INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)");
  const applied = new Set(db.prepare("SELECT id FROM _migrations").all().map((r: any) => r.id));
  const dir = new URL("../migrations/", import.meta.url).pathname; // adjust for dist layout — see note
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const id = Number(f.slice(0, 3));
    if (applied.has(id)) continue;
    db.exec("BEGIN"); try {
      db.exec(readFileSync(join(dir, f), "utf8"));
      db.prepare("INSERT INTO _migrations (id, applied_at) VALUES (?, ?)").run(id, new Date().toISOString());
      db.exec("COMMIT");
    } catch (e) { db.exec("ROLLBACK"); throw e; }
  }
}
```
> Note: run the server with `tsx` in dev so `migrations/` resolves next to `src/`. For the production container (P4) copy `migrations/` beside the compiled output and resolve via `process.cwd()`/an env path. Keep the resolution in **one** place.

Repos (`repo/items.ts` etc.) hold module-level `db.prepare(...)` statements and export typed functions (`listItems(filter)`, `getItem(id)`, `createItem(input)`, `updateItem(id, patch)`, `archiveItem(id)`, `getByQrUid`). `createItem` fills `id`, `qrUid` (`newId(8)`), timestamps, and appends an `added` row to `usage_log`.

## Routes

Register in `app.ts` under `/api`. Validate every body/query with a shared zod schema (`Schema.parse(...)`, 400 on `ZodError`). Endpoints:

- `GET /api/health` → `{ data: { ok: true } }` (used by HA watchdog later).
- `GET /api/items` — query: `q?`, `location?`, `status?`, `sort?` (`urgency`|`name`|`recent`, default `urgency`), `includeArchived?`. Compute status server-side (join category), sort by `daysLeft` nulls-last for `urgency`.
- `POST /api/items` (body `ItemInput`), `GET /api/items/:id`, `PATCH /api/items/:id` (partial), `POST /api/items/:id/archive`.
- `POST /api/items/:id/events` — append a `usage_log` row; if `fraction_after` given, also update the item.
- `GET /api/categories`, `GET /api/locations` (+ POST for both — needed by the web settings screen later; keep them here).
- `GET /api/lookup/:barcode` → `services/off.ts`.

## `services/off.ts`

```ts
import { db } from "../db.js";
import { config } from "../config.js";

export type OffResult = { found: boolean; name?: string; brand?: string; size?: string; imageUrl?: string };

export async function lookup(barcode: string): Promise<OffResult> {
  const cached = db.prepare("SELECT off_json FROM lookup_cache WHERE barcode = ?").get(barcode) as any;
  if (cached) return mapOff(JSON.parse(cached.off_json));

  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`
    + `?fields=product_name,brands,quantity,image_front_small_url`;
  const res = await fetch(url, { headers: { "User-Agent": config.offUserAgent } });
  if (res.status === 503) throw new Error("Open Food Facts rate-limited; try again shortly");
  const json = await res.json();
  db.prepare("INSERT OR REPLACE INTO lookup_cache (barcode, off_json, fetched_at) VALUES (?,?,?)")
    .run(barcode, JSON.stringify(json), new Date().toISOString());
  return mapOff(json);
}

export function mapOff(json: any): OffResult {           // pure → unit-tested
  if (!json || json.status === 0 || !json.product) return { found: false };
  const p = json.product;
  return { found: true, name: p.product_name || undefined, brand: p.brands || undefined,
           size: p.quantity || undefined, imageUrl: p.image_front_small_url || undefined };
}
```

`off.test.ts`: feed a saved sample OFF JSON and a `{status:0}` blob to `mapOff` and assert the mapping. **Do not hit the network in tests.**

## Seed (`seed.ts`, run after `migrate()` when tables are empty)

Insert the default locations (Cupboard, Spice rack, Fridge, Freezer, Baking shelf) and the category table from [01-product.md](../01-product.md#freshness-model) with their `openLifeDays`/`hardExpiry`.

## Acceptance checklist

Run from repo root. All automated unless marked 🖐.

- [ ] `pnpm install` completes.
- [ ] `pnpm check` green (types + prettier).
- [ ] `pnpm test` green (`computeStatus` + `mapOff` cases).
- [ ] `pnpm dev` boots on `:8099`; a fresh `data/whattoeat.db` appears; second boot does not re-run migrations or re-seed.
- [ ] `curl localhost:8099/api/health` → `{"data":{"ok":true}}`.
- [ ] `curl localhost:8099/api/categories` returns the seeded categories.
- [ ] Create → read → patch → archive an item via curl; `GET /api/items?sort=urgency` orders most-urgent first; an item with a best-before 3 days out reports `status:"use_soon"`.
- [ ] `curl localhost:8099/api/lookup/5000159407236` returns a mapped product (a real UK barcode); a second call is served from cache (no outbound request — confirm by checking `lookup_cache`, or temporarily logging fetches).
- [ ] Unknown barcode → `{ found:false }`, no crash.

## Definition of done

Server runs, data persists across restarts, OFF lookup works and caches, tests green. Commit `P1: server core, schema, Open Food Facts lookup`. **Stop. Do not start P2.**
