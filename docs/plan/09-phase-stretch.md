# P9 · Stretch grab-bag (re-plan before building)

**Goal:** the "if I still fancy it" pile. Unlike P1–P8, **this file is not directly executable** — each idea needs its own short planning pass first (ideally re-run the deep-research step for the specific integration, since these touch external systems that move). Pick by appetite, one at a time, each as its own `P9x` mini-phase with its own acceptance checklist.

**Prerequisites:** the relevant earlier phases (noted per idea).

## Ideas, roughly by value

### P9a · Home Assistant sensors + shopping list → HA todo (needs P4, P7)
Expose `sensor.whattoeat_expiring_soon` and `sensor.whattoeat_low_stock` so HA can automate (voice announce "three things expire this week", show on a dashboard). Cleanest route: **MQTT discovery** — publish config + state topics; the add-on can reach HA's Mosquitto. Also push the shopping list into an HA **todo** list entity. Re-plan: confirm the current MQTT discovery schema and whether to use the Supervisor token + REST todo API vs MQTT. Verify against live HA docs at build time.

### P9b · LLM "what can I make?" (needs P1; optional Anthropic key)
Add `ANTHROPIC_API_KEY` (already in the add-on schema). A `POST /api/suggest` sends the current expiring items to Claude and returns 2–3 recipe ideas. Re-plan: pin the model id and SDK version by consulting the **claude-api skill** (do not hardcode a model from memory); keep it strictly optional (feature-flagged off when no key); cache suggestions to avoid per-open API calls; show a clear "AI-generated" label. Cost is tiny at this volume but make it on-demand, not scheduled.

### P9c · NFC lids as a QR alternative (needs P5)
NTAG213 stickers storing the same `/i/:qrUid` URL; iPhones read them natively (no app). Mostly a documentation + label-writing task (write tags with a phone NFC app). Optional in-app "write tag" via Web NFC (Android/Chrome only — iOS Safari can't write). Re-plan: decide whether any code is needed at all or it's purely a how-to in `docs/03-hardware.md`.

### P9d · Waste / usage stats (needs P1 — data already logged)
`usage_log` has recorded events since P1. Add a stats screen: what you bin most, what you never finish, throughput per category. Pure read-side; no schema change. Re-plan: decide the handful of queries and one screen.

### P9e · Second / multiple displays (needs P6)
`GET /api/display.png` already takes params — add `?panel=` presets (resolution + layout) for a different device, and per-panel content (e.g. one shows fridge-only). Re-plan: parameterise layout by panel profile.

## Protocol for P9

For whichever you pick: **write a `docs/plan/09x-<name>.md`** mirroring the P1–P8 format (goal, verified facts + sources, code skeleton, acceptance checklist incl. 🖐 items), get it approved, then implement in a single session. Do **not** batch several P9 ideas into one change.

## Definition of done

There is no single "done" — each `P9x` is done when its own checklist passes. This file just holds the backlog so nothing is lost.
