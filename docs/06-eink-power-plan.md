# EatMe e-paper power plan (fallback: modular ESP32-C6 build)

Last reviewed: 2 August 2026

**This document is no longer the primary implementation plan.** The Adafruit
MagTag is now the preferred hardware — see
[07-magtag-plan.md](07-magtag-plan.md). This document is kept as the fallback
plan for the modular controller-plus-display build, in case the MagTag proves
unsuitable. Do not buy the parts below (a replacement controller, the ADA6106,
a separate display) until that happens.

This document also supersedes the immediate solar purchasing recommendation in
`05-hardware-research.md`. Solar remains a planned second stage on either
route.

## Current decision

Build and validate a battery-powered e-paper display without solar hardware.

Use the parts already available:

- Tenstar Robot ESP32-C6 Super Mini;
- protected 2000 mAh single-cell LiPo;
- Adafruit PowerBoost 1000C.

The e-paper display is **not selected yet**. Select it after comparing the
shortlist in this document.

The first goal is functional validation:

1. power the controller from the battery;
2. connect and refresh the selected e-paper display;
3. download the EatMe dashboard image over Wi-Fi;
4. enter deep sleep after each refresh;
5. confirm reliable wake, update and sleep cycles.

Do not use the PowerBoost stage to estimate final battery life.

## Temporary PowerBoost 1000C power path

```text
protected LiPo
  -> PowerBoost 1000C battery connector
PowerBoost 1000C 5.2 V output
  -> removable link or switch
  -> Tenstar 5V pin
Tenstar 3.3 V
  -> e-paper VCC
all grounds common
```

The PowerBoost 1000C provides battery charging, load sharing and a regulated
approximately 5.2 V output. This makes it suitable for functional bring-up of
the Tenstar through its `5V` input.

The PowerBoost 1000C uses a Micro-B charging connector. A USB-C power supply can
feed it through a USB-C-to-Micro-B cable, but the board itself does not provide a
USB-C socket.

Connect the LiPo only to the PowerBoost during this stage. Do not also connect
the same battery to the Tenstar battery pads.

Use a removable link or switch between the PowerBoost output and the Tenstar
`5V` pin. Open this link before connecting the Tenstar USB-C port for flashing
or debugging. Do not connect two 5 V sources unless the board power path has
been verified.

## Why the PowerBoost is temporary

The PowerBoost 1000C consumes about 5 mA while its boost converter and output
indicator are enabled. This equals about 0.44 Wh each day from a 3.7 V battery,
before controller sleep current and wake activity are included.

Therefore, the PowerBoost can validate:

- controller operation;
- e-paper wiring;
- Wi-Fi reliability;
- image download and refresh behaviour;
- firmware sleep sequencing.

It cannot validate:

- final standby current;
- realistic battery endurance;
- final solar panel size;
- the final charger and regulator losses.

A 2000 mAh, 3.7 V battery stores about 7.4 Wh nominally. After allowing for a
reasonable discharge limit and conversion loss, the temporary system has about
10 to 12 days of reserve if the PowerBoost dominates the load. Measure the real
result.

## E-paper display research decision

Do not select a display mainly from refresh power. E-paper refresh energy is
small compared with the PowerBoost standby load and the Wi-Fi wake period.

Compare these factors:

1. final dashboard layout and viewing distance;
2. active display dimensions and aspect ratio;
3. resolution and smallest readable text;
4. current ESPHome `epaper_spi` support;
5. full-refresh time and visible flashing;
6. partial-refresh support and ghosting requirements;
7. 3.3 V logic compatibility and driver-board level shifting;
8. standard Serial Peripheral Interface access without requiring another MCU;
9. module outline, cable position and enclosure depth;
10. UK availability and exact panel revision.

Keep the first display black-and-white. Multi-colour versions refresh more
slowly and add no required EatMe function.

### Shortlist

| Display | Main advantage | Main concern |
|---|---|---|
| Waveshare 4.2-inch, 400 x 300, black/white | Larger portrait-like area and existing 400 x 300 server render | Lower pixel density and legacy ESPHome component |
| Waveshare 3.97-inch HAT+, 800 x 480, black/white | Highest pixel density and current `epaper_spi` support | Smaller vertical active area and HAT-shaped board |
| Waveshare 4.26-inch HAT, 800 x 480, black/white | Wide readable layout and current `epaper_spi` support | Long narrow panel shape |
| Waveshare 5.83-inch, 648 x 480, black/white | Best viewing distance and largest active area | Larger enclosure and legacy ESPHome component |

Before ordering, render the real EatMe dashboard at each candidate resolution.
Print each render at actual size. View it from the intended distance.

## Planned solar upgrade

When it becomes available, replace the PowerBoost with the **Adafruit BQ25185
USB/DC/Solar Charger with 5 V Boost, product 6106**.

Planned final power path:

```text
5 to 7 V solar panel
  -> ADA6106 solar input
USB-C top-up
  -> ADA6106 USB-C input
protected LiPo
  -> ADA6106 battery connector
ADA6106 regulated 5 V output
  -> isolation link or switch
  -> controller 5V input
controller 3.3 V
  -> e-paper VCC
all grounds common
```

The solar system must remain described as solar-assisted until winter testing at
the actual installation position proves that harvested energy exceeds daily
consumption.

## Rough solar sizing

Use daily energy, not battery capacity, to size the panel.

```text
required panel power
  = daily load in Wh
  / effective winter sun-hours behind the window
```

For initial modelling, use an effective winter yield of 0.2 to 0.4 Wh each day
for every rated watt of panel. This intentionally includes window, orientation,
charger and weather losses. Replace this assumption with measurements at the
actual window.

The temporary PowerBoost setup should be budgeted at about 0.5 Wh each day.
This gives a calculated minimum near 1.25 to 2.5 W. Add reserve for consecutive
cloudy days and non-ideal positioning.

Provisional panel guidance:

- unobstructed south-facing window: 6 V monocrystalline panel, 3 to 5 W;
- east-facing or west-facing window: 6 V monocrystalline panel, 5 to 10 W;
- north-facing or heavily shaded window: do not assume solar-only operation;
- four 5 V, 30 mA mini-panels provide only 0.6 W rated total and are too small
  for a reliable PowerBoost-based system.

The 2000 mAh battery provides weather buffering. It does not correct an annual
or winter energy deficit.

After replacing the PowerBoost, measure complete-system sleep current and update
energy again. The final low-power system might need only a 1 to 3 W panel, but
do not select that panel from estimates alone.

Use PVGIS for the installation location, panel angle and window direction. PVGIS
models an outdoor panel. Apply a separate window-loss factor and verify it with
a current measurement at the actual window.

## How the later solar stage affects current hardware choices

### Controller

The first controller remains the owned Tenstar ESP32-C6 Super Mini.

Any replacement controller must:

- accept a regulated 5 V input from the future ADA6106;
- support reliable ESP32 deep sleep;
- complete Wi-Fi association and image download quickly;
- provide enough exposed Serial Peripheral Interface pins for the display;
- avoid always-on LEDs or regulators that cause high standby current;
- allow safe isolation from external 5 V while its USB port is connected.

The Seeed XIAO ESP32-C6 remains the preferred compact fallback. Do not buy it
until the Tenstar has been tested.

The future solar plan does not require a controller with an onboard LiPo
charger. The ADA6106 will be the only battery charger. This avoids parallel
charger circuits and makes the power path easier to verify.

### Display

The solar plan does not force one display from the shortlist. All four retain
their image without continuous power.

Select the display from layout, readability, software support and enclosure
requirements. Confirm that firmware can put the display into sleep or remove
its power after each refresh.

### Enclosure and wiring

Reserve space and access for:

- the future ADA6106 board;
- a 3 to 10 W panel cable and strain relief;
- an external USB-C top-up port;
- a power-isolation switch or removable link;
- a shaded and mechanically protected LiPo position.

Do not design the enclosure tightly around the PowerBoost 1000C. It is not the
final power board.

## Firmware implications

The battery-first firmware must already use the final operating pattern:

- wake once per scheduled interval;
- connect to Wi-Fi;
- download one rendered image;
- refresh the display;
- enter deep sleep immediately;
- enter deep sleep after a connection or download timeout;
- avoid a continuously active battery-voltage divider;
- use a static Internet Protocol address when practical.

The current `firmware/eatme-display.yaml` is still a reference configuration for
a XIAO ESP32-C3. Do not flash it unchanged to the Tenstar C6. Confirm the exact
Tenstar pin map and update the ESP32-C6 board configuration first.

## Purchase plan

Buy only the parts needed after the display comparison:

- one selected black-and-white e-paper display;
- suitable Serial Peripheral Interface leads or headers;
- removable power link or switch, if none is available;
- required connectors and temporary enclosure hardware.

Defer these purchases until the ADA6106 is available and the prototype works:

- solar charger;
- solar panel;
- replacement controller;
- final enclosure built around the solar hardware.

## Validation sequence

1. Render the EatMe screen for each shortlisted display.
2. Print each render at actual size and select the display.
3. Run the selected display from bench USB power.
4. Run the same hardware from the PowerBoost and LiPo.
5. Verify at least 50 wake, download, refresh and sleep cycles.
6. Measure wake duration and update reliability.
7. Replace the PowerBoost with the ADA6106 when available.
8. Measure complete-system sleep current at the battery.
9. Test candidate solar panels at the intended window during poor weather.
10. Confirm energy neutrality through winter before removing USB top-up as a requirement.

## Primary hardware references

- [Adafruit PowerBoost 1000C guide](https://learn.adafruit.com/adafruit-powerboost-1000c-load-share-usb-charge-boost)
- [Adafruit BQ25185 charger with 5 V boost](https://www.adafruit.com/product/6106)
- [ESPHome ePaper SPI display support](https://esphome.io/components/display/epaper_spi/)
- [PVGIS](https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis_en)
- [EatMe hardware research](05-hardware-research.md)
