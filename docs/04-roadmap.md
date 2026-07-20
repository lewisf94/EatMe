# 04 · Roadmap

Nine phases, ordered so **every phase ends with something genuinely usable** — no long trench before the first jar gets tracked. Each is independently useful; if work stops after any of them, nothing is left half-wired.

> This is the human-readable overview. The **authoritative, executable breakdown** — with code skeletons, verified library/API/hardware facts, and per-phase acceptance checklists — lives in [`docs/plan/`](plan/README.md). When the two disagree, `docs/plan/` wins. Build **one phase per session**, in order.

| Phase | Spec | Delivers | Done when… |
|---|---|---|---|
| **P1** | [server core](plan/01-phase-server-core.md) | Monorepo, SQLite schema, CRUD API, Open Food Facts lookup | an item added by *typing* a barcode gets OFF-prefilled and survives a restart |
| **P2** | [web app](plan/02-phase-web-app.md) | Inventory list/search, item detail, quick-tap fractions, add/edit, settings | the app is genuinely usable in a phone browser; the server alone serves the built UI |
| **P3** | [camera PWA](plan/03-phase-camera-pwa.md) | Camera barcode scanning, installable + offline shell | scanning a real barcode prefills Add; the app installs to the Home Screen |
| **P4** | [HA add-on](plan/04-phase-ha-addon.md) | Home Assistant add-on + **bundled Tailscale HTTPS** | it runs on the Pi, persists to `/data`, and the iPhone reaches it over `https://…ts.net` — unlocking the camera |
| **P5** | [QR labels](plan/05-phase-qr-labels.md) | QR labels for decanted jars, deep links, print sheet | a printed label on a spice jar, scanned, opens that jar's fraction buttons |
| **P6** | [e-ink display](plan/06-phase-eink-display.md) | `/api/display.png` renderer + ESPHome firmware for the XIAO ESP32-C3 + Waveshare 4.2″ (solar + LiPo + USB-C) | the kitchen display shows the top "eat me first" items and refreshes unattended |
| **P7** | [recipes & shopping](plan/07-phase-recipes-shopping.md) | Recipes, use-it-up ranking, shopping list | nearly-empty → shopping list; use-it-up ranks a recipe using an expiring item |
| **P8** | [push](plan/08-phase-push.md) | Web Push (Monday digest, day-before hard-expiry) | Monday 9am the phone buzzes "5 things to use this week" |
| **P9** | [stretch](plan/09-phase-stretch.md) | HA sensors, LLM suggestions, NFC, stats — each re-planned first | each `P9x` passes its own checklist |

## Sequencing notes

- **P1–P4 are the critical path** to "useful on the phone". P4 is what makes the camera work on iOS (it needs HTTPS), so P3's on-device verification often lands alongside P4.
- After P4, the rest are largely independent and reorderable. **P5** is the highest joy-per-hour (it's the whole point — spice jars); **P6** is the most fun toy. Pull either forward once P4 works.
- Hardware isn't needed until **P6** — order the parts (XIAO ESP32-C3, Waveshare 4.2″, a 1000–1500 mAh LiPo, a small solar panel) whenever, since nothing's blocked on them until then. The display stays swappable by design (server renders a PNG; firmware just fetches it), so the board can still change later.
- Each phase should land as its own set of commits with the docs updated to match reality.

---

Back to: [README](../README.md) · Execute from: [docs/plan/](plan/README.md)
