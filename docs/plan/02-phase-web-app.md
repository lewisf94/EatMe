# P2 · Web app (list, search, add/edit, quick-tap)

**Goal:** a usable browser UI on top of the P1 API. No camera yet (P3), no offline yet — just fast, one-handed CRUD that already earns its keep on a laptop or phone browser.

**Prerequisites:** P1 green.

## Deliverables

1. `apps/web` — Vite + React 19 + Tailwind v4 + `react-router-dom`.
2. Server serves the built web app (`@fastify/static`) so app + API share one origin.
3. Screens: **Inventory** (search/filter/sort, status badges), **Item detail** (quick-tap fraction, opened toggle, edit, archive), **Add item** (manual + "look up barcode" by typing the number), **Settings** (locations & categories).
4. A typed API client in `apps/web/src/api.ts` using the shared zod types.
5. Dev proxy so `pnpm dev` runs web (Vite) + server together.

## Setup notes (from research — follow exactly)

- Install `vite @vitejs/plugin-react tailwindcss @tailwindcss/vite react-router-dom` at current majors. Tailwind v4 has **no `tailwind.config.js`**: add `tailwindcss()` to `vite.config.ts` plugins and put a single `@import "tailwindcss";` at the top of `src/index.css`.
- `apps/web/package.json` scripts: `dev` (`vite`), `build` (`vite build`), `check` (`tsc --noEmit && vite build` — the build doubles as a smoke test), `preview`.
- Dev proxy in `vite.config.ts`:
  ```ts
  server: { proxy: { "/api": "http://localhost:8099" } }
  ```
- Root `dev` script becomes: run server and web together (add `concurrently` at the root, or document `pnpm --filter @whattoeat/server dev` + `pnpm --filter @whattoeat/web dev` in two terminals). Prefer `concurrently`.

## Serving the built app from the server

In `app.ts`, after API routes, register `@fastify/static` pointing at the web `dist`, with a SPA fallback so client routes (`/item/:id`, `/i/:qrUid` later) resolve:

```ts
await app.register(import("@fastify/static"), { root: webDist, wildcard: false });
app.setNotFoundHandler((req, reply) => {
  if (req.url.startsWith("/api")) return reply.code(404).send({ error: { message: "not found" } });
  return reply.sendFile("index.html");
});
```
`webDist` = env `WEB_DIST` or the default relative path to `apps/web/dist`. In dev you use the Vite proxy instead; static serving matters for the container (P4).

## API client (`src/api.ts`)

Thin `fetch` wrapper returning `data`, throwing on `error`. Import types from `@whattoeat/shared`. One function per endpoint (`listItems`, `getItem`, `createItem`, `patchItem`, `archiveItem`, `postEvent`, `lookupBarcode`, `getCategories`, `getLocations`). Keep the shared status helper client-side too so badges match the server.

## Screens & components

- **Inventory** (`/`): sticky search box (debounced `q`), filter chips (location, status), sort toggle (urgency default). Each row: name, brand, location, a coloured **status badge** (`ok` grey · `use_soon` amber · `past_best` orange · `expired` red), and the fraction as a small bar. Empty state explains how to add.
- **Item detail** (`/item/:id`): big name; the **six quick-tap fraction buttons** (`FRACTIONS` from shared) that `POST /events` with `fraction_after` and optimistically update; an **"Opened today"** toggle (sets `openedAt`); edit form (location, category, best-before date input, notes); **Archive** (with confirm). Show computed status + "best by / use within N days".
- **Add** (`/add`): a **barcode field with a "Look up" button** → `GET /api/lookup/:barcode`, prefilling name/brand/size/photo; category + location selectors (seeded); optional best-before; save. (In P3 the camera fills this same barcode field — build the form so the scanner just writes into it.)
- **Settings** (`/settings`): list/add/rename locations and categories (categories expose `openLifeDays`, `warnDays`, `hardExpiry`). Uses the POST endpoints from P1.

Keep styling utilitarian: system font, large tap targets (min 44px), thumb-reachable primary actions. No component library needed; a few Tailwind components is enough. Dark-mode via `prefers-color-scheme` is a nice-to-have, not required here.

## State

Keep it simple — React state + a tiny fetch layer. **Do not** add Redux/Zustand/React Query unless a later phase needs it; local `useState`/`useEffect` and a manual refetch-after-mutation is fine at this size.

## Acceptance checklist

- [ ] `pnpm check` green (includes `vite build`).
- [ ] `pnpm dev` serves web on Vite's port, proxying `/api` to the server; hot reload works.
- [ ] Add an item **manually** end-to-end; it appears in Inventory and persists across reload.
- [ ] "Look up" with a real barcode number prefills the form from OFF.
- [ ] Quick-tap ½ on an item updates its fraction immediately and survives reload; a `usage_log` row was written (check via API or DB).
- [ ] Search narrows the list; the urgency sort puts a near-expiry item on top; the status badge colour matches `computeStatus`.
- [ ] Archive removes it from the default list; `?includeArchived=1` still shows it.
- [ ] After `pnpm --filter @whattoeat/web build`, the **server alone** (no Vite) serves the app at `localhost:8099/` and client-side routes deep-link correctly (reload on `/item/:id` works).

## Definition of done

The app is genuinely usable in a phone browser (even if not yet "installed"). Commit `P2: web UI — inventory, item detail, add, settings`. **Stop.**
