# CLAUDE.md

## Project context

EatMe is a self-hosted household food inventory app. The optional e-paper unit
wakes, downloads a rendered dashboard image, refreshes the panel and returns to
deep sleep.

## Current e-paper hardware decision

Follow `docs/06-eink-power-plan.md` as the current implementation plan.

The immediate build is battery-powered and does not include solar:

- controller: owned Tenstar Robot ESP32-C6 Super Mini;
- display: Waveshare 4.2-inch black-and-white 400 x 300 e-paper;
- temporary power board: owned Adafruit PowerBoost 1000C;
- battery: owned protected single-cell LiPo.

Use the PowerBoost only for functional bring-up. Its standby consumption is too
high for final battery-life measurements.

The planned upgrade uses the Adafruit BQ25185 USB/DC/Solar Charger with 5 V
Boost, product 6106, when it becomes available. The future charger will provide
solar charging, USB-C top-up charging, power-path management and regulated 5 V.

## Hardware constraints

- Keep the LiPo connected to only one charger.
- Do not connect the LiPo to the Tenstar battery pads while using PowerBoost or ADA6106.
- Isolate external 5 V before connecting the controller USB-C port.
- Power the e-paper module from the controller 3.3 V rail.
- Preserve space for ADA6106, solar wiring, USB-C access and a shaded battery.
- Do not select a replacement controller until the Tenstar is measured.
- A replacement controller must accept regulated 5 V and support low-current deep sleep.

## Firmware status

`firmware/eatme-display.yaml` currently targets a XIAO ESP32-C3 reference build.
Do not flash it unchanged to the Tenstar ESP32-C6.

Before hardware testing:

- change the ESP32 target to ESP32-C6;
- confirm every Tenstar pin assignment;
- start network work only after Wi-Fi connects;
- use one image request per wake;
- enter deep sleep after success or a bounded failure;
- avoid a permanently active low-value battery divider.

## Sources of truth

- Current implementation plan: `docs/06-eink-power-plan.md`
- Active buying list: `docs/parts-list.md`
- Broader research and alternatives: `docs/05-hardware-research.md`
- Firmware reference: `firmware/eatme-display.yaml`

Do not treat the older solar-first recommendation in the research document as
the immediate purchase plan.
