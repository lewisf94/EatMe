# Implementation plan — how to execute

This directory is the **machine-executable plan**. It was researched and written by a stronger model (Claude Fable 5, July 2026) so that each phase can be implemented by a cheaper model (e.g. Claude Sonnet) — or a human — in a single focused session without re-deriving decisions or guessing at APIs. Library versions, hardware pins, API limits and gotchas in these files were **verified against live sources**; sources and dates are in [research-notes.md](research-notes.md).

## Protocol for the implementing agent

1. **Read [`00-conventions.md`](00-conventions.md) and your phase file. Nothing else is required.** The `docs/0X-*.md` files are human background reading; if they ever disagree with `docs/plan/`, **`docs/plan/` wins**.
2. **Do exactly one phase per session**, in order. Do not start the next phase, "improve" earlier phases, or add features the phase file doesn't list. Smaller diffs beat cleverness.
3. Phase files contain code skeletons. **Copy them as written**, completing only the parts marked `// TODO(impl)`. They encode researched decisions (exact import paths, config keys, pins); do not restyle or "modernise" them.
4. **Run the acceptance checklist** at the end of your phase file. Every box must pass before you commit. If a box cannot pass in your environment (e.g. needs the physical Pi or iPhone), it is marked 🖐 **manual** — leave it to Lewis, say so in your summary, and make sure everything automated passed.
5. **If reality contradicts the spec** — a pinned version is gone, an API rejects the documented call, a build fails for a reason the failure-modes table doesn't cover — **stop, write what you found in [research-notes.md](research-notes.md) under "Deviations", and report**. Do not improvise around it with a different library or approach.
6. Commit to the working branch with message `P<n>: <summary>` and push. One phase may be several commits; keep each one green (`pnpm check` passes).

## Phase index & current status

**P1–P4 are built** (on `main`). A post-P4 review then reshaped the order: harden
first, fix the data model, then Lewis's priority (local receipt import) and real
offline — *before* the remaining features. Execute top-to-bottom.

| # | Phase | File | Delivers | Status |
|---|---|---|---|---|
| 1 | P1 | [01-phase-server-core.md](01-phase-server-core.md) | Monorepo, SQLite, CRUD API, OFF lookup | ✅ done |
| 2 | P2 | [02-phase-web-app.md](02-phase-web-app.md) | Web UI: list, search, add/edit, quick-tap | ✅ done |
| 3 | P3 | [03-phase-camera-pwa.md](03-phase-camera-pwa.md) | Camera scanning, installable PWA | ✅ done |
| 4 | P4 | [04-phase-ha-addon.md](04-phase-ha-addon.md) | HA add-on + bundled Tailscale HTTPS | ✅ done (🖐 Pi install) |
| 5 | **H** | [10-phase-correctness-hardening.md](10-phase-correctness-hardening.md) | Fix review bugs, commit e2e tests, add CI | ✅ done (CI green) |
| 6 | **DM** | [11-phase-data-model.md](11-phase-data-model.md) | products / stock-lots / containers + date semantics | ✅ done |
| 7 | **RC** | [12-phase-receipt-import.md](12-phase-receipt-import.md) | **Local** receipt OCR → review → stock (no cloud) | **next** ⭐ (Pi 5 8GB → Route A) |
| 8 | **OFF** | [13-phase-offline.md](13-phase-offline.md) | Offline inventory snapshot + queued writes | after DM |
| 9 | P5 | [05-phase-qr-labels.md](05-phase-qr-labels.md) | QR labels — now tied to **containers** (DM) | printer helps |
| 10 | P7 | [07-phase-recipes-shopping.md](07-phase-recipes-shopping.md) | Recipes, use-it-up, shopping list | on DM |
| 11 | P6 | [06-phase-eink-display.md](06-phase-eink-display.md) | `/api/display.png` + ESPHome firmware | 🖐 XIAO C3 + Waveshare 4.2″ |
| 12 | P8 | [08-phase-push.md](08-phase-push.md) | Web Push notifications | 🖐 iPhone |
| 13 | P9 | [09-phase-stretch.md](09-phase-stretch.md) | Stretch grab-bag — plan each first | varies |

> The old P5–P8 specs still hold, with two adjustments from DM: P5's QR belongs to
> a **container**, and P7's "repurchase" **adds a new stock-lot** (never revives an
> old row). Read those phase files *through* [DM](11-phase-data-model.md).

Each phase leaves the app **usable and deployable**. If work stops after any phase, nothing is half-wired.

## What was verified vs. assumed

✅ Verified July 2026 (see research-notes.md): npm package versions; `node:sqlite` stability; Open Food Facts rate limits and User-Agent policy; reTerminal E1001 ESPHome pins/driver; the Home Assistant Tailscale add-on's inability to front other add-ons (which forced the bundled-tailscaled design); iOS Web Push preconditions; resvg/zxing wasm/musl-arm64 support.

⚠️ Still assumption-level, flagged inline where relevant: exact `tailscale serve` CLI flags (verify with `--help` at P4), the reTerminal battery ADC pin (check Seeed's cookbook at P6), the ESPHome `online_image` trigger/action spelling (re-check current docs at P6), and the exact self-hosted zxing `.wasm` path (resolve at P3). Web stack: install Vite + the Tailwind/PWA plugins together at their current `latest` so peer ranges agree — do **not** pin an older Vite major.
