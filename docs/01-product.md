# 01 · Product

## The problem

Cupboards accumulate. A jar of tahini gets bought for one recipe and vanishes behind the tins. Spices decanted into matching jars lose their labels and their history — that garam masala might be six months old or six years old. Things get rebought that were already there, and things get binned that could have been eaten.

EatMe answers three questions with as little effort as possible:

1. **What have I got?** (and where is it, and how much is left)
2. **What should I use up first?** (and what could I cook with it)
3. **What do I need to buy?** (and what do I *not* need to buy, while standing in the shop)

The effort budget is the whole design constraint: if updating the inventory takes more than a few seconds per item, it will be abandoned within a month. Every flow below is optimised for one-handed, few-tap use in a kitchen.

## User stories

- **Putting the shopping away** — scan each barcode, details appear prefilled, pick a location, type the best-before date, done. Target: under 10 seconds per item.
- **While cooking** — used half the jar of curry paste: open the item (or scan the QR on its lid) and tap **½**. Two taps.
- **Decanting spices** — bought refill bags, filled the matching jars: add each spice once, print a sheet of QR labels, stick them on the lids. From then on, scanning a lid opens that jar's update screen.
- **In the supermarket** — "do I already have smoked paprika?": search from the phone, see *"Smoked paprika — spice rack, ~½ left, opened 4 months ago"*. Requires access from outside the house (see [architecture § HTTPS and remote access](02-architecture.md#https-and-remote-access)).
- **Friday, deciding dinner** — open the *Use it up* view: items nearest to going off, and recipes ranked by how many of them they use.
- **Walking past the kitchen display** — glance at the e-ink screen: top five "eat me first" items and tonight's use-it-up suggestion. No interaction; it's read-only by design (interaction happens on the phone).
- **Sunday planning** — the shopping list already contains everything marked low or finished during the week.

## Features

### MVP (roadmap P1–P4)

- Add items: by barcode scan (Open Food Facts lookup), or manually for loose/decanted things
- Item fields: name, brand, category, location, size, photo, best-before, opened date, notes
- Quantity: quick-tap fraction remaining — **Full / ¾ / ½ / ¼ / Nearly empty / Empty**; optional exact amount + unit for people who weigh things
- Locations: editable list (Cupboard, Spice rack, Fridge, Freezer, Baking shelf, …)
- Search & filter: by name, location, status; sort by "most urgent first"
- Freshness status per item (rules below) with a badge: **OK / Use soon / Past its best / Expired**
- Printable QR labels for jars without barcodes; scanning a label deep-links to that item
- E-ink kitchen dashboard fed by the server

### Fast follow (P5–P6)

- Recipes: personal recipe list with ingredient tags; *use-it-up* ranking against expiring items; TheMealDB search for inspiration
- Shopping list: auto-add on **Empty**, one-tap prompt on **Nearly empty**; tick-off view; item rejoins inventory on repurchase
- Web Push notifications: weekly digest ("5 things to use this week") and day-before warnings for hard expiry items

### Stretch (P7)

- Home Assistant sensors (`expiring_soon`, `low_stock`) for automations and dashboards; sync shopping list to an HA todo list
- LLM suggestions (Claude API, optional key): "what can I make with these five things?"
- NFC stickers as an alternative to QR labels (iPhone reads NTAG tags natively)
- Waste/usage stats ("you binned 3 things this month; you never finish coriander")

### Non-goals (v1)

- Calorie/nutrition tracking, meal planning calendars
- Multi-household accounts and per-user auth (one household, trusted network — see architecture)
- OCR of printed best-before dates (hard, flaky; typing a date is quick)
- Smart-scale/weight-sensor integration

## Freshness model

Two clocks run per item, and the sooner one wins:

1. **Best-before** — typed in when the item is added (barcodes never encode dates).
2. **Opened-life** — `opened_at` + a per-category default for how long the item stays good once opened. This is the clock that matters for spices, whose printed dates are about potency, not safety.

```
pressure_date = earliest of:
  best_before                      (if set)
  opened_at + open_life_days       (if opened and category has a default, or item overrides)

status:
  past pressure_date  → "Expired" for hard-expiry categories (fridge jars, fresh)
                        "Past its best" for ambient/dried goods (quality, not safety)
  within warn window  → "Use soon"   (default 14 days, configurable per category)
  otherwise           → "OK"
```

Default opened-life by category (editable; sensible starting points, not food-safety advice):

| Category | Opened-life default | Hard expiry? |
|---|---|---|
| Ground spices | 9 months | no |
| Whole spices | 24 months | no |
| Dried herbs | 9 months | no |
| Curry/cooking pastes (jar) | 6 weeks | yes (fridge) |
| Cooking sauces (jar, opened) | 1 week | yes (fridge) |
| Chutneys & pickles | 3 months | yes (fridge) |
| Jams & spreads | 3 months | yes (fridge) |
| Oils | 6 months | no |
| Nuts & seeds | 4 months | no |
| Flour & baking | 8 months | no |
| Dried pasta, rice, pulses | — (best-before only) | no |
| Tins (unopened) | — (best-before only) | no |

## Data model

SQLite via the built-in `node:sqlite` module (no ORM — see [architecture](02-architecture.md) and the [build plan](plan/00-conventions.md)). Sketch (field types abbreviated):

```ts
locations:  id, name, sortOrder
categories: id, name, openLifeDays?, warnDays (default 14), hardExpiry (bool)

items:
  id, name, brand?, barcode?,        // barcode null for decanted/loose items
  categoryId, locationId,
  photoUrl?, notes?,
  quantityTotal?, unit?,             // e.g. 400, "g" — optional
  fractionLeft (0..1, default 1),
  bestBefore?,                       // date, typed in at add time
  openedAt?,                         // date; null = unopened
  openLifeDays?,                     // per-item override of the category default
  qrUid,                             // short unique code for the printed QR label
  archivedAt?, createdAt, updatedAt

usage_log:   id, itemId, event, fractionAfter?, at
             // event: added | opened | fraction_changed | finished | binned | repurchased
lookup_cache: barcode (pk), offJson, fetchedAt      // Open Food Facts responses
recipes:     id, name, url?, notes?, tags
recipe_ingredients: recipeId, matchText, required (bool)
shopping_list: id, itemId?, name, addedAt, doneAt?
push_subscriptions: id, endpoint, keysJson, createdAt
settings:    key (pk), value
```

Notes:

- `fractionLeft` is deliberately coarse — the quick-tap buttons write 1 / 0.75 / 0.5 / 0.25 / 0.1 / 0. Coarse data that gets updated beats precise data that doesn't.
- **Empty** archives the item (it stops cluttering views) but keeps its history, so repurchasing is one tap from the shopping list and revives the record — barcode, category and all.
- `usage_log` exists for the stats stretch goal and costs nothing to record from day one.
- `recipe_ingredients.matchText` is matched loosely (case-insensitive substring) against item names — "chickpea" matches "Chickpeas 400g tin". Good enough without an ontology.

---

Next: [02 · Architecture](02-architecture.md)
