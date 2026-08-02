# EatMe MagTag plan

Last reviewed: 2 August 2026

This document is the current implementation plan for the EatMe e-paper
display. It supersedes the modular ESP32-C6 build in
[06-eink-power-plan.md](06-eink-power-plan.md) as the preferred design. That
document remains as the fallback plan — see
[Fallback](#fallback-the-modular-esp32-c6-build) below.

## Current decision

Build the display around the **Adafruit MagTag**, a finished ESP32-S2 board
with an integrated 2.9-inch, 296 x 128, black/white e-paper display, four
buttons and a LiPo charge circuit.

The MagTag replaces:

- the Tenstar Robot ESP32-C6 Super Mini controller;
- the separate Waveshare 4.2-inch e-paper display;
- the Adafruit PowerBoost 1000C;
- the hand-wired display cabling;
- a separate USB-C battery charger.

The 2.9-inch, 296 x 128 display is smaller and lower-resolution than the
400 x 300 panel in the modular plan, but is acceptable for the planned
dashboard interface: a short urgent-items list, a recipe suggestion or a
shopping summary, not a dense table.

## Power

Use the existing owned 2,000 mAh single-cell protected LiPo. Verify it has a
JST-PH 2.0 mm connector and correct polarity before connecting it.

```text
protected 2000 mAh LiPo
  -> MagTag battery socket (JST-PH 2.0 mm)
MagTag USB-C port
  -> charges the same battery through the onboard charge circuit
MagTag regulated rails
  -> onboard e-paper display and ESP32-S2
```

- Connect the battery directly to the MagTag's own battery socket.
- Charge it through the MagTag's USB-C port. Do not add a separate charger.
- **Do not use the Adafruit PowerBoost 1000C with the MagTag.** The MagTag
  has its own charge and power-path circuit; adding the PowerBoost would put
  two chargers on one cell.
- Keep the LiPo connected to only one charger at any time, matching the
  general hardware constraint below.

## Software

Use **CircuitPython 10 or later** on the MagTag. The previous ESPHome
firmware (`firmware/eatme-display.yaml`) is not relevant to this hardware
route — it stays in the repository only as the reference build for the
[fallback](#fallback-the-modular-esp32-c6-build) modular ESP32-C6 plan.

Wake cycle:

1. wake from a timer or a button press;
2. connect to Wi-Fi;
3. download a 296 x 128 image from the EatMe server;
4. refresh the display;
5. report optional status (battery, wake reason, firmware version, Wi-Fi
   signal);
6. enter deep sleep.

Use one image request per wake, and enter deep sleep after success or a
bounded failure — the same firmware discipline as the modular plan.

An initial build following this cycle is in `firmware/magtag/` (`code.py`,
`settings.toml.example`). It decodes the HTTP response in RAM and uses sleep
memory for the selected page, so routine wakes do not write flash. **It has not been run on real
hardware** — see `firmware/magtag/README.md` for the setup steps and a
verification checklist (button-to-pin mapping, battery reading,
an actual end-to-end wake cycle) to work through once a MagTag is in hand.

Button wake is configurable. On ESP32-S2, CircuitPython publishes about 230 µA
for time-alarm deep sleep and about 1.65 mA for pin-alarm deep sleep. Leave
`EATME_BUTTON_WAKE` enabled for the four-button interface, or disable it for
timer-only updates and substantially lower sleep current. Measure the complete
delivered board in both modes before estimating battery life.

## Server changes

Add a dedicated MagTag render profile that generates a four-level grayscale
image at 296 x 128 pixels, matching the panel's native resolution and gray
depth. Implemented in:

- `apps/server/src/services/magtagDisplay.ts` — the render profile (urgent,
  recipe and shopping layouts, sized for the small panel);
- `apps/server/src/routes/magtag.ts` — the HTTP endpoints, registered at the
  `/api/magtag/*` prefix.

The image is served as a **BMP**, not a PNG. `adafruit_imageload` can decode an
indexed BMP directly from the HTTP response in memory, avoiding a temporary
file and filesystem remount. The render profile quantizes to a 4-color grayscale palette and encodes a
4-bit indexed BMP (~19 KB), a twelfth the size of an equivalent 24-bit BMP,
which matters for wake time and therefore battery life.

Endpoints:

| Endpoint | Purpose |
|---|---|
| `GET /api/magtag/display.bmp` | Dashboard image download (the default wake screen — urgent items) |
| `GET /api/magtag/page/:page` | Selected page download (`urgent`, `recipe` or `shopping`) |
| `POST /api/magtag/status` | Device status reporting (battery, wake reason, firmware, Wi-Fi signal) |
| `POST /api/magtag/button` | Optional button-press telemetry |

All four endpoints accept `?token=` and are gated by the Home Assistant app's
`magtag_token` option, exported as `MAGTAG_TOKEN` (see
`apps/server/src/config.ts`) — **do not store a
Home Assistant administrator token on the MagTag.** This mirrors the existing
`DISPLAY_TOKEN` pattern for the classic panel, but uses its own value so the
two devices carry independent, revocable credentials.

## Home Assistant connection

The MagTag connects to the EatMe app over local Wi-Fi only. EatMe already
exposes a local network port (`8099`) from its Home Assistant add-on — no
new port is required. The MagTag does not need, and must not be given,
direct Home Assistant control.

Message Queuing Telemetry Transport (MQTT) can be added later to publish
battery and status entities into Home Assistant, once the HTTP-only flow is
proven.

## Interface plan

The four onboard buttons select:

1. Urgent food (the default dashboard);
2. Recipe suggestion;
3. Shopping summary;
4. Manual refresh (re-fetches the current page).

Keep the first version **read-only**: button presses only change what's
displayed, never inventory data. `POST /api/magtag/button` records which
button was pressed for future use, but has no side effects today.

## Solar plan

Defer solar until the battery-powered MagTag has been measured. When ready,
the later system can add:

- Adafruit ADA6106 solar charger;
- a 5–7 V solar panel;
- the existing 2,000 mAh battery;
- a regulated 5 V supply to the MagTag.

When the external ADA6106 becomes the only battery charger, **leave the
MagTag's own battery socket unused** — the same single-charger rule as the
modular plan, just with the ADA6106 in place of the MagTag's onboard
circuit.

## Current order

Buy:

- one Adafruit MagTag;
- one pack of four magnetic feet;
- a USB-C data cable, if one isn't already available.

Check the existing battery has:

- a JST-PH 2.0 mm connector;
- correct polarity (verify with a multimeter before connecting).

Optional cables:

- one 3-pin STEMMA-to-male cable;
- one 3-pin STEMMA-to-female cable;
- one 4-pin STEMMA QT cable;
- one or two PicoBlade matching pairs for the Home Controller motor.

## Fallback: the modular ESP32-C6 build

If the MagTag proves unsuitable — for example the 2.9-inch panel is too
small to read at a glance, or a CircuitPython limitation blocks the wake
cycle — fall back to the modular build already documented in
[06-eink-power-plan.md](06-eink-power-plan.md): the Tenstar Robot ESP32-C6
Super Mini, a Waveshare 4.2-inch 400 x 300 display, the Adafruit PowerBoost
1000C for bring-up, and the ESPHome firmware in
`firmware/eatme-display.yaml`. Do not buy fallback-only parts (a replacement
controller, the ADA6106, a separate display) until the MagTag has actually
been tried and found wanting.
