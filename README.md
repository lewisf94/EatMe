# EatMe

EatMe is a self-hosted food inventory app for jars, spices, tins and cupboard staples. Scan a barcode, track what remains, and see what needs using first.

## Features

- Barcode scanning with Open Food Facts product lookup
- Printable QR labels for decanted jars and containers
- Best-before, use-by and opened-date freshness tracking
- Quick updates for quantity remaining
- Searchable inventory and shopping list
- Local receipt import with a review step before stock is added
- Offline inventory access and queued changes
- Optional e-ink kitchen display
- Optional web-push reminders for items to use soon

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
addon/           App documentation and local OCR sidecar
firmware/        ESPHome configuration for the e-ink display
docs/            Product, architecture, hardware and implementation notes
```

## Development

```sh
pnpm install
pnpm dev
```

Open `http://localhost:5173`. The API runs on port `8099`.

For Home Assistant installation and configuration, see [addon/DOCS.md](addon/DOCS.md). Receipt import uses a local stub by default, so the complete workflow can be tested without cloud services.

## Project status

The core server, web app, camera scanning, Home Assistant packaging, offline support, receipt import, QR labels, recipes, shopping list, e-ink display support and push notifications are implemented. Hardware flashing, printer setup and on-device iPhone verification remain hands-on tasks.

Detailed product, architecture and implementation notes are in [docs](docs).

MIT licensed.
