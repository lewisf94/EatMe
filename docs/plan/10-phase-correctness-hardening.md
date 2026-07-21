# H · Correctness & CI hardening (do this before more features)

**Why:** a post-P4 review found real defects in shipped code and a durability gap
(the browser tests were never committed; there's no CI). Fix these while the
schema is still young — it's far cheaper now than after the data-model and
receipt work land on top. **No new features in this phase.**

**Prerequisites:** P1–P4. **Verification:** every fix gets a committed test; CI
must be green.

## Confirmed bugs to fix

1. **Clearing an optional value is broken.** `update({ bestBefore: value || undefined })`
   → `JSON.stringify` drops `undefined` → the server receives an empty patch and
   never clears the field (same for `notes`, `openedAt`).
   - `@eatme/shared`: make patch fields explicitly nullable — `bestBefore`,
     `openedAt`, `notes` become `.nullable()`. The client sends `null` to clear.
   - `repo/items.updateItem`: a key **present with `null`** sets the column NULL;
     a key **absent** is skipped. (Today it coalesces `null` correctly *if* the
     key arrives — the fix is the client sending `null` + the schema allowing it.)
   - Web: `onChange={(e) => update({ bestBefore: e.target.value || null })}`.

2. **Timezone.** `computeStatus` derives "today" via `toISOString()` (UTC) → off by
   a day near local midnight in BST, and the P8 scheduler would inherit it.
   - Add a `household_timezone` setting (default `Europe/London`), stored in
     `settings`.
   - `@eatme/shared`: `civilToday(tz)` → `YYYY-MM-DD` using
     `Intl.DateTimeFormat(en-CA, { timeZone })`. `computeStatus` takes the civil
     date string (not a `Date`). Use it for status, notifications, "opened today",
     and display.

3. **`archiveItem` always logs `binned`** → poisons future waste stats.
   - Add an **archive reason**: `finished | binned | duplicate | mistake | other`.
     Migration adds `usage_log.reason` (or the new `usage_events.reason`).
     `POST /api/items/:id/archive` takes `{ reason }`; the UI asks (a small
     action sheet) instead of a bare confirm.

4. **Open Food Facts cache is forever — and caches "not found" forever.**
   - Store `found` + honour `fetched_at`: hits valid ~30 days, misses ~3 days,
     then re-fetch. (Full local override comes with the products table in the
     [data-model phase](11-phase-data-model.md).)

5. **Settings can't rename/edit** (only list/add; API only GET/POST) — needed
   before categories drive safety-flavoured warnings.
   - Add `PATCH /api/categories/:id` and `/api/locations/:id`; edit UI for name,
     open-life, warn window, quality-vs-hard default, sort order, default location.

6. **Error handling** — pages fire `api.x().then(setState)` with no `.catch`, so a
   failed request shows "Loading…" forever.
   - A small `useAsync`/request-state helper (loading/error/retry), visible error
     messages, a top-level React error boundary, and cancellation of stale
     in-flight search requests. **Do not** add Redux — the fetch layer stays.

## Durability: commit the tests + add CI

- **Move the ad-hoc Playwright suites into the repo** as real `@playwright/test`
  tests (`apps/web/e2e/*.spec.ts`): the P2 inventory flow, P3 PWA/offline/
  fallback, and the fake-camera decode. They currently live only in a scratchpad.
- **`.github/workflows/ci.yml`**: on push/PR — Node 22 + 24 matrix,
  `pnpm install --frozen-lockfile`, `pnpm check`, unit tests, the Playwright e2e
  (build web, boot the server with `WEB_DIST`, run), and a `docker build` of
  `addon/Dockerfile` (amd64) as a smoke test.

## Acceptance checklist

- [ ] `pnpm check` + all tests green; **CI workflow green on GitHub**.
- [ ] Clearing a best-before / notes from the item screen **persists** (reload
      confirms it's gone). Regression test added.
- [ ] DST/midnight test: an item due "tomorrow" reads correctly at 00:30 BST.
- [ ] Archiving asks a reason; the reason is recorded on the event.
- [ ] An OFF "not found" is re-fetched after its short TTL (unit test on the cache
      logic).
- [ ] Renaming a location/category works end-to-end.
- [ ] A forced API failure shows an error + retry, not an infinite spinner.
- [ ] The Playwright suites run **in CI**, not just locally.

## Definition of done

Real bugs fixed, "green" is now enforced by CI, and the browser tests live in the
repo. Commit `H: correctness fixes + CI + committed e2e tests`. **Stop.**
