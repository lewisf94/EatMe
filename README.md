# EatMe

EatMe is a self-hosted household food inventory. Add food manually, scan a barcode or import a receipt, then see what needs using first.

## Features

- Barcode scanning with Open Food Facts product lookup
- Printable QR labels for decanted jars and containers
- Best-before, use-by and opened-date freshness tracking
- Automatic storage, category and best-quality suggestions from a researched local rules table
- Quick updates for quantity remaining
- Searchable inventory and shopping list
- Local receipt import with a review step before stock is added
- Offline inventory access and queued changes
- Optional e-ink kitchen display
- Optional web-push reminders for items to use soon
- Dietary-filtered starter recipes with repeat-safe one-click import

## Components

| Component | Purpose |
|---|---|
| Server | Fastify API and SQLite database, packaged as a Home Assistant app. Data is stored in `/data` and included in Home Assistant backups. |
| Phone app | Installable web app with barcode scanning, offline access and notifications. |
| Display | Optional ESPHome e-ink display that fetches a small dashboard image from the server. |

## Repository layout

```text
config.yaml      Home Assistant app manifest
apps/server/     Fastify API, migrations and scheduled jobs
apps/web/        React progressive web app
packages/shared/ Shared schemas and types
addon/           App documentation and installable local OCR service
firmware/        ESPHome configuration for the e-ink display
docs/            Product, architecture, hardware and implementation notes
```

## Development

```sh
pnpm install
pnpm dev
```

Open `http://localhost:5173`. The API runs on port `8099`.

For Home Assistant installation and configuration, see [addon/DOCS.md](addon/DOCS.md).
Install the **EatMe OCR** app from the same repository for real receipt
recognition. The development server keeps a fixed stub provider for repeatable
automated tests; it is not intended to recognise photographs.

Automatic guidance works offline and is applied consistently to manual adds, barcode scans, receipt imports, extra packs and shopping-list rebuys. A date printed on the pack always takes priority. Generated dates are clearly marked as estimated best-quality reminders, never as manufacturer use-by dates. See [food guidance and sources](docs/food-guidance.md) for the method and references.

## Project status

The core server, web app, camera scanning, Home Assistant packaging, offline support, receipt import, automatic food guidance, QR labels, recipes, shopping list, e-ink display support and push notifications are implemented. Hardware flashing and printer setup remain hands-on tasks.

Detailed product, architecture and implementation notes are in [docs](docs).
For the optional peripherals, see the [hardware parts list](docs/parts-list.md).
The current battery-first e-paper build and later solar upgrade are documented in
the [e-paper power plan](docs/06-eink-power-plan.md). Supporting controller,
display and solar research remains in the
[e-paper hardware research](docs/05-hardware-research.md).

MIT licensed.
