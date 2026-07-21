# 04 · Roadmap

Ordered so **every phase ends with something genuinely usable** — no long trench before the first jar gets tracked. **P1–P4 are built.** A post-P4 review then reshaped the order: harden and fix the data model first, then the priority feature (local receipt import) and real offline, then the rest.

> This is the human-readable overview. The **authoritative, executable breakdown** — with code skeletons, verified facts, and per-phase acceptance checklists — lives in [`docs/plan/`](plan/README.md). When the two disagree, `docs/plan/` wins. Build **one phase per session**, in order.

| Phase | Spec | Delivers | Status |
|---|---|---|---|
| **P1** | [server core](plan/01-phase-server-core.md) | Monorepo, SQLite, CRUD API, Open Food Facts lookup | ✅ done |
| **P2** | [web app](plan/02-phase-web-app.md) | Inventory list/search, item detail, quick-tap, add/edit, settings | ✅ done |
| **P3** | [camera PWA](plan/03-phase-camera-pwa.md) | Camera barcode scanning, installable PWA | ✅ done |
| **P4** | [HA add-on](plan/04-phase-ha-addon.md) | Home Assistant add-on + **bundled Tailscale HTTPS** | ✅ done (🖐 Pi install) |
| **H** | [correctness & CI](plan/10-phase-correctness-hardening.md) | Fix the review's bugs, commit the e2e tests, add CI | **next** |
| **DM** | [data model](plan/11-phase-data-model.md) | products / stock-lots / **containers**, use-by vs best-before, timezone | after H |
| **RC** ⭐ | [receipt import](plan/12-phase-receipt-import.md) | **Local** receipt OCR → review → stock lots (no cloud) — the primary intake | after DM |
| **OFF** | [offline](plan/13-phase-offline.md) | Offline inventory snapshot + queued edits ("do I have this?" in the shop) | after DM |
| **P5** | [QR labels](plan/05-phase-qr-labels.md) | QR labels — now tied to reusable **containers** | after DM |
| **P7** | [recipes & shopping](plan/07-phase-recipes-shopping.md) | Recipes, use-it-up ranking, shopping list | after DM |
| **P6** | [e-ink display](plan/06-phase-eink-display.md) | `/api/display.png` + ESPHome firmware (XIAO C3 + Waveshare 4.2″) | 🖐 hardware |
| **P8** | [push](plan/08-phase-push.md) | Web Push (Monday digest, day-before) | 🖐 iPhone |
| **P9** | [stretch](plan/09-phase-stretch.md) | HA sensors, LLM, NFC, stats — each re-planned first | later |

## Sequencing notes

- **P1–P4 (built) are the critical path** to "useful on the phone" — install on the Pi with Tailscale and the scan→add→track loop works on the iPhone.
- **Harden before more features.** H fixes real bugs and adds CI so "green" is durable; DM corrects the data model while it's cheap (before receipts/recipes build on it).
- **Receipts (RC) are a core phase, not an add-on** — the primary way stock gets in, because Lewis (and realistically anyone) won't add items one at a time. It runs **fully local, no cloud** — no hosted OCR fallback, ever; the receipt image never leaves the Pi. RC needs DM (stable product identity + aliases).
- Hardware isn't needed until **P6** — the display stays swappable by design.
- Each phase lands as its own commits with docs updated to match reality.

---

Back to: [README](../README.md) · Execute from: [docs/plan/](plan/README.md)
