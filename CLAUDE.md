# CLAUDE.md

## Project context

EatMe is a self-hosted household food inventory app. The optional e-paper unit
wakes, downloads a rendered dashboard image, refreshes the panel and returns to
deep sleep.

## Current e-paper hardware decision

Follow `docs/07-magtag-plan.md` as the current implementation plan.

The preferred build is the **Adafruit MagTag**: a finished ESP32-S2 board with
an integrated 2.9-inch, 296 x 128 black/white e-paper display, four buttons and
a LiPo charge circuit. It replaces the controller, separate display, PowerBoost
and display wiring from the earlier modular plan.

- controller + display: owned/to-buy Adafruit MagTag;
- battery: owned protected single-cell 2,000 mAh LiPo, connected directly to
  the MagTag's own battery socket;
- charging: through the MagTag's USB-C port. Do not use the PowerBoost 1000C
  with the MagTag.

Solar remains deferred until the battery-powered MagTag is measured. The later
upgrade uses the Adafruit ADA6106 solar charger with a 5–7 V panel and the
existing LiPo; when it becomes the only charger, leave the MagTag's own
battery socket unused.

### Fallback: modular ESP32-C6 build

If the MagTag proves unsuitable, the fallback is the modular build described
in `docs/06-eink-power-plan.md`:

- controller: owned Tenstar Robot ESP32-C6 Super Mini;
- display: Waveshare 4.2-inch black-and-white 400 x 300 e-paper;
- temporary power board: owned Adafruit PowerBoost 1000C;
- battery: owned protected single-cell LiPo.

Do not buy fallback-only parts (a replacement controller, the ADA6106, a
separate display) unless the MagTag is actually found unsuitable.

## Hardware constraints

MagTag route:

- Connect the LiPo directly to the MagTag's own battery socket; verify JST-PH
  2.0 mm polarity first.
- Keep the LiPo connected to only one charger — do not also connect it to a
  PowerBoost or an ADA6106 while it's on the MagTag.
- Leave the MagTag's battery socket unused if an external ADA6106 later
  becomes the only charger (solar stage).

Fallback (modular ESP32-C6) route only:

- Keep the LiPo connected to only one charger.
- Do not connect the LiPo to the Tenstar battery pads while using PowerBoost or ADA6106.
- Isolate external 5 V before connecting the controller USB-C port.
- Power the e-paper module from the controller 3.3 V rail.
- Preserve space for ADA6106, solar wiring, USB-C access and a shaded battery.
- Do not select a replacement controller until the Tenstar is measured.
- A replacement controller must accept regulated 5 V and support low-current deep sleep.

## Firmware status

The MagTag route uses **CircuitPython 10 or later**, not ESPHome. Its firmware
is not yet written; follow the wake cycle in `docs/07-magtag-plan.md` (wake,
connect Wi-Fi, download one 296 x 128 image, refresh, report optional status,
deep sleep).

`firmware/eatme-display.yaml` is an ESPHome reference build for the XIAO
ESP32-C3, kept only for the modular ESP32-C6 fallback route. Do not flash it
unchanged to a Tenstar ESP32-C6, and do not use it for the MagTag — the MagTag
does not run ESPHome. Before fallback hardware testing:

- change the ESP32 target to ESP32-C6;
- confirm every Tenstar pin assignment;
- start network work only after Wi-Fi connects;
- use one image request per wake;
- enter deep sleep after success or a bounded failure;
- avoid a permanently active low-value battery divider.

## Server-side MagTag support

The server exposes a dedicated MagTag render profile and endpoints, gated by a
separate `MAGTAG_TOKEN` (never the Home Assistant admin token):

- `apps/server/src/services/magtagDisplay.ts` — 296 x 128 four-gray render
  profile (urgent items, recipe suggestion, shopping summary).
- `apps/server/src/routes/magtag.ts` — `GET /api/magtag/display.png`,
  `GET /api/magtag/page/:page`, `POST /api/magtag/status`,
  `POST /api/magtag/button`.

## Sources of truth

- Current implementation plan: `docs/07-magtag-plan.md`
- Fallback implementation plan: `docs/06-eink-power-plan.md`
- Active buying list: `docs/parts-list.md`
- Broader research and alternatives: `docs/05-hardware-research.md`
- Firmware reference (fallback route only): `firmware/eatme-display.yaml`

Do not treat the older solar-first recommendation, or the modular ESP32-C6
build, in the research document as the immediate purchase plan — the MagTag
is current; the modular build is the documented fallback.
