# Implementation plan

This directory contains the implementation record for EatMe. Each phase describes the decisions, constraints, checks and sources for one focused piece of work. Sources and dates are collected in [research-notes.md](research-notes.md).

## Implementation protocol

1. Read [`00-conventions.md`](00-conventions.md) and the relevant phase file. The `docs/0X-*.md` files provide background; where they differ, `docs/plan/` takes precedence.
2. Keep changes focused. Do not add unrelated features while completing a phase.
3. Run the acceptance checklist and automated checks before committing. Items requiring physical hardware or an iPhone are marked as manual verification.
4. If a documented dependency or API has changed, record the finding under [Deviations](research-notes.md#deviations) before changing direction.

## Phase index and current status

| Phase | File | Delivers | Status |
|---|---|---|---|
| P1 | [01-phase-server-core.md](01-phase-server-core.md) | Monorepo, SQLite, CRUD API and Open Food Facts lookup | Built |
| P2 | [02-phase-web-app.md](02-phase-web-app.md) | Web UI, search, add/edit and quick updates | Built |
| P3 | [03-phase-camera-pwa.md](03-phase-camera-pwa.md) | Camera scanning and installable web app | Built |
| P4 | [04-phase-ha-addon.md](04-phase-ha-addon.md) | Home Assistant app and bundled Tailscale HTTPS | Built; Pi verification required |
| H | [10-phase-correctness-hardening.md](10-phase-correctness-hardening.md) | Review fixes, end-to-end tests and CI | Built |
| DM | [11-phase-data-model.md](11-phase-data-model.md) | Products, stock lots, containers and date semantics | Built |
| RC | [12-phase-receipt-import.md](12-phase-receipt-import.md) | Local receipt import and review | Built; OCR sidecar verification required |
| OFF | [13-phase-offline.md](13-phase-offline.md) | Offline inventory snapshot and queued changes | Built |
| P5 | [05-phase-qr-labels.md](05-phase-qr-labels.md) | QR labels for reusable containers | Built; printer and scan verification required |
| P6 | [06-phase-eink-display.md](06-phase-eink-display.md) | E-ink display API and ESPHome configuration | Built; hardware verification required |
| P7 | [07-phase-recipes-shopping.md](07-phase-recipes-shopping.md) | Recipes, use-it-up ranking and shopping list | Built |
| P8 | [08-phase-push.md](08-phase-push.md) | Web push notifications | Built; iPhone delivery verification required |
| P9 | [09-phase-stretch.md](09-phase-stretch.md) | Optional future work | Planned individually |

## Research status

Verified in July 2026: package versions; `node:sqlite`; Open Food Facts limits and User-Agent policy; e-ink hardware support; Home Assistant Tailscale limitations; iOS Web Push prerequisites; and the deployed web app's barcode-scanning assets.

Recheck at implementation time: exact `tailscale serve` flags, e-ink battery ADC pin, ESPHome trigger names and the barcode scanner's bundled wasm path.
