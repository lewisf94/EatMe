# 04 · Roadmap

Seven phases, ordered so that **every phase ends with something genuinely usable** — no six-week trench before the first jar gets tracked. Hardware is deliberately late (P4): the app must earn its place on the Home Screen first.

## P1 — Server core + minimal web UI

The skeleton: pnpm monorepo, Drizzle schema + migrations for the [data model](01-product.md#data-model), CRUD API, Open Food Facts lookup proxy with caching, and a bare-bones web UI (list, search, add, edit — no camera yet). Runs locally via Docker.

**Done when:** an item can be added by *typing* its barcode number on a laptop, OFF prefills the details, and everything survives a container restart.

## P2 — Phone-ready PWA, running on the Pi

The phase that makes it real: camera barcode scanning (`barcode-detector` ponyfill), quick-tap fraction buttons, urgency-sorted expiry views, PWA manifest + service worker, HA add-on packaging, Tailscale Serve HTTPS set up and documented.

**Done when:** a real tin is scanned and added *from the iPhone*; the installed Home-Screen icon opens full-screen; search works from outside the house over the tailnet.

## P3 — QR labels for decanted jars

`qrUid` deep links (`/i/:uid`), the printable label sheet, and the scan-lid → quick-update flow. Solves the spice-jar problem the project exists for.

**Done when:** a paper QR label on a spice jar, scanned with the iPhone camera app, lands directly on that jar's fraction buttons.

## P4 — E-ink kitchen display

Server-side renderer (`/api/display.png`), ESPHome config in `firmware/`, battery reporting into HA. Order the board (~£50, [hardware doc](03-hardware.md)) when this phase starts.

**Done when:** the display sits in the kitchen showing the top five "eat me first" items, refreshes ~4×/day unattended for a week, and its battery % is visible in Home Assistant.

## P5 — Recipes & shopping list

Personal recipe list with ingredient tags, *use-it-up* ranking against expiring items, TheMealDB lookup for inspiration, and the shopping-list flows (auto-add on Empty, prompt on Nearly empty, repurchase revives the item).

**Done when:** marking the curry paste nearly-empty puts it on the shopping list, and the display shows a recipe suggestion that uses something expiring this week.

## P6 — Notifications

Web Push (VAPID) to the installed PWA: Monday digest of the week's "use soon" items, day-before alerts for hard-expiry items only. Deliberately sparse.

**Done when:** Monday 9am, the phone buzzes with "5 things to use this week" and tapping it opens the *Use it up* view.

## P7 — Stretch grab-bag

Pick by appetite, in no particular order:

- **HA integration**: `expiring_soon` / `low_stock` sensors via MQTT discovery → automations, voice announcements, HA dashboards; shopping list synced to an HA todo list
- **LLM suggestions**: optional Anthropic key in add-on config → "what can I make with these?" against the actual inventory
- **NFC stickers** as a QR alternative
- **Stats**: waste log, "never again buy coriander" insights
- **Second display** (`panel=` already parameterised)

## Sequencing notes

- P1+P2 are the critical path and roughly equal in size; everything after is independent and reorderable.
- If motivation ever wobbles, P3 is the highest joy-per-hour phase and P4 is the most fun — both are fine to pull forward once P2 works.
- Each phase should land as its own PR-sized branch off `main` with the docs updated to match reality.

---

Back to: [README](../README.md)
