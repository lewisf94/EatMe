# DM · Data-model refactor (products / stock lots / containers)

**Why:** the current single `items` table conflates five things — product
*identity*, a physical *pack/batch*, a reusable *container* (spice jar), current
*quantity*, and *history*. That breaks on real cases: two tins with different
dates, the same product in two places, a refilled jar overwriting the old jar's
history, and — critically — **receipts need a stable product identity**, and a
**QR label belongs to a reusable container, not one purchase**. Fixing the schema
now (only P1–P4 exist) is far cheaper than after receipts/recipes build on it.

**Prerequisites:** [H](10-phase-correctness-hardening.md). **Keep the UI as simple
as it is today** — the schema gets more accurate, the screen does not.

## New schema (migration `00X_data_model.sql`)

```sql
products (            -- reusable identity: "Tesco chickpeas 400 g"
  id, name, brand, barcode, category_id, default_location_id,
  package_quantity, package_unit, image_url, created_at, updated_at)

stock_lots (          -- a physical pack/batch you actually own
  id, product_id, location_id, count, fraction_left,
  purchased_at, date_type,        -- 'use_by' | 'best_before' | NULL
  date_value, opened_at, open_life_days_override,
  archived_at, archive_reason, source, created_at, updated_at)

containers (          -- a reusable physical thing with a QR label (a spice jar)
  id, qr_uid, name, product_id, location_id, current_stock_lot_id)

usage_events (        -- history, now keyed to the lot (rename of usage_log)
  id, stock_lot_id, event, fraction_after, reason, at)
```

Keep `categories`, `locations`, `lookup_cache`.

## Date semantics (from the review — safety matters)

The use-by vs best-before distinction belongs to the **date printed on the pack**,
not the category:

- `date_type='use_by'` past → **Past use-by** (safety)
- `date_type='best_before'` past → **Past best-before** (quality)
- open-life reminder passed → **Quality may be declining**
- no date → **no safety judgement**

Avoid the word "Expired" unless it's an explicitly entered `use_by`. Keep the
category's open-life/warn as a *default/fallback*; the per-lot `date_type` +
`open_life_days_override` win. Update `computeStatus` and `StatusBadge` to this
vocabulary. The app should state its open-life figures are reminders, not
food-safety guarantees.

## Migration from `items`

For each existing row: find-or-create a **product** (dedupe by `barcode`, else
`name`+`brand`) → create one **stock_lot** carrying quantity/fraction/dates/
opened/archived → create one **container** with the item's `qr_uid` pointing at
that lot (so printed QR deep-links keep working). Existing `best_before` →
`date_type='best_before'` (we can't retro-know use-by; the user can correct).
Preserve `usage_log` rows into `usage_events` (map `item_id`→`stock_lot_id`).
**Write a test that runs the migration on a P1-shaped DB and asserts counts +
QR-uid continuity.**

## API reshape (UI stays simple by aggregating)

- `GET /api/inventory` → **aggregated rows**: product + a rollup of its *active*
  lots (total count, nearest pressure date, worst status). Powers the Cupboard
  list, e.g. `Chickpeas · 3 tins · nearest 14 Sep`.
- `GET /api/products/:id` → product + its stock lots.
- `POST /api/stock-lots`, `PATCH /api/stock-lots/:id` (fraction/opened/date),
  `POST /api/stock-lots/:id/archive { reason }`.
- `GET /i/:qrUid` → container → its current lot's quick-update screen (unchanged
  UX; new plumbing).
- Repurchase (old P7 behaviour) becomes: **add a new stock_lot** to the product —
  never revive/overwrite an old lot. History stays intact; "binned 3×" is now
  countable.

## UI (unchanged feel)

Cupboard shows aggregated products; tapping shows the lots; the quick-tap
fraction buttons act on a lot (or the container's current lot). Most items are
"one product, one lot" and look exactly like today.

## Acceptance checklist

- [ ] Migration runs on a P1-era DB: item count == product/lot/container count;
      every old `qr_uid` still resolves via `/i/:qrUid`. (Committed test.)
- [ ] Two lots of one product (different dates) show as one aggregated row with
      the nearest date; opening/finishing one lot doesn't touch the other.
- [ ] A refilled container gets a new lot; the previous lot's history remains.
- [ ] Status wording: a passed `best_before` reads "Past best-before" (not
      "Expired"); a passed `use_by` reads "Past use-by".
- [ ] `pnpm check` + unit + e2e green in CI.

## Definition of done

Accurate product/stock/container model with existing data migrated and the UI
still simple. Commit `DM: products/stock-lots/containers + date semantics`. **Stop.**
