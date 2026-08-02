# AGENTS.md

## Project context

EatMe is a self-hosted household food inventory app. Its optional e-paper unit
wakes, downloads a server-rendered dashboard, refreshes the panel and returns to
deep sleep.

## Current e-paper hardware decision

Use `docs/07-magtag-plan.md` as the current plan. The preferred build is an
Adafruit MagTag: ESP32-S2, integrated 2.9-inch 296 × 128 four-gray e-paper,
four buttons, LiPo socket and USB-C charging.

- Connect the protected LiPo directly to the MagTag only after checking
  JST-PH polarity.
- Charge through the MagTag USB-C port.
- Do not connect the PowerBoost or another charger to the same battery.
- Defer solar until the complete battery-powered unit has been measured.

The modular Tenstar ESP32-C6 + Waveshare 4.2-inch build in
`docs/06-eink-power-plan.md` is the fallback only.

## MagTag firmware rules

The CircuitPython 10+ client is in `firmware/magtag/`.

- Fetch one 296 × 128 indexed BMP per wake.
- Decode the response in RAM; routine wakes must not write CIRCUITPY flash.
- Use `board.BATTERY` for the documented battery divider, with compatibility
  fallback only when necessary.
- Force landscape rotation and verify the native image dimensions.
- Enter deep sleep after success or a bounded failure.
- Disable Wi-Fi, speaker and NeoPixel power before sleeping.
- Keep button wake configurable: ESP32-S2 `PinAlarm` uses materially more sleep
  current than a timer-only alarm.
- Store only the device-scoped `magtag_token` on the MagTag, never the household
  API/admin token.

The firmware remains unverified on physical hardware. Complete at least 50
wake/download/refresh/sleep cycles and measure sleep current with button wake
both enabled and disabled.

## Server-side MagTag support

- `apps/server/src/services/magtagDisplay.ts`: four-gray urgent, recipe and
  shopping layouts plus BMP encoding.
- `apps/server/src/routes/magtag.ts`: image, status and button endpoints under
  `/api/magtag/*`.
- `magtag_token` in the Home Assistant app is exported as `MAGTAG_TOKEN` and
  gates those routes through `?token=`.

## Fallback hardware rules

These apply only if the MagTag is rejected and the modular build is resumed:

- Keep the battery connected to one charger only.
- Leave Tenstar battery pads unused with PowerBoost or ADA6106.
- Isolate external 5 V before connecting Tenstar USB-C.
- Feed Tenstar through `5V` and the e-paper module from 3.3 V.
- Do not buy a replacement controller before measuring the Tenstar.

## Sources of truth

- Current plan: `docs/07-magtag-plan.md`
- MagTag setup: `firmware/magtag/README.md`
- Active buying list: `docs/parts-list.md`
- Fallback plan: `docs/06-eink-power-plan.md`
- Hardware research: `docs/05-hardware-research.md`
