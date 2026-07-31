# AGENTS.md

## Project context

EatMe is a self-hosted household food inventory app. Its optional e-paper unit
wakes, downloads a rendered dashboard image, refreshes the panel and returns to
deep sleep.

## Current hardware plan

Use `docs/06-eink-power-plan.md` as the current decision record.

The immediate build is battery-powered without solar:

- owned Tenstar Robot ESP32-C6 Super Mini;
- Waveshare 4.2-inch black-and-white 400 x 300 e-paper display;
- owned Adafruit PowerBoost 1000C as a temporary charger and 5 V supply;
- owned protected single-cell LiPo.

The PowerBoost is for functional bring-up only. Its standby current prevents
valid final battery-life measurements.

The planned second stage uses the Adafruit BQ25185 USB/DC/Solar Charger with
5 V Boost, product 6106. Add the solar panel only after the battery-powered
system operates reliably and the charger becomes available.

## Mandatory hardware rules

- Connect the battery to only one charger.
- Leave the Tenstar battery pads unused with PowerBoost or ADA6106.
- Isolate external 5 V before connecting the Tenstar USB-C port.
- Feed the Tenstar through its `5V` input.
- Feed the e-paper module from the controller 3.3 V rail.
- Reserve enclosure space for ADA6106, solar wiring and USB-C access.
- Keep the battery shaded and mechanically protected.
- Do not buy a replacement controller before measuring the Tenstar.

## Controller selection constraints

The future solar charger produces regulated 5 V. Any replacement controller
must accept this supply and must support reliable low-current deep sleep.

Prefer the Seeed XIAO ESP32-C6 only if the Tenstar fails current or reliability
tests. Do not select a board because of bare-chip sleep figures alone.

## Firmware warning

`firmware/eatme-display.yaml` still targets a XIAO ESP32-C3 reference setup.
Do not flash it unchanged to the Tenstar ESP32-C6.

Before testing hardware:

- select the ESP32-C6 target;
- verify the exact Tenstar pin map;
- start the download after Wi-Fi connects;
- make one image request per wake;
- enter deep sleep after success or a bounded failure;
- avoid a permanently active battery divider.

## Documents

- Current plan: `docs/06-eink-power-plan.md`
- Active buying list: `docs/parts-list.md`
- Research archive: `docs/05-hardware-research.md`
- Firmware reference: `firmware/eatme-display.yaml`

Treat the solar-first recommendation in the older research document as
superseded for the first build.
