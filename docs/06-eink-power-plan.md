# EatMe e-paper power plan

Last reviewed: 31 July 2026

This document is the current implementation plan. It supersedes the immediate
solar purchasing recommendation in `05-hardware-research.md`. Solar remains a
planned second stage.

## Current decision

Build and validate the e-paper display without solar hardware.

Use the parts already available:

- Tenstar Robot ESP32-C6 Super Mini;
- protected single-cell LiPo;
- Adafruit PowerBoost 1000C;
- Waveshare 4.2-inch black-and-white 400 x 300 e-paper display.

The first goal is functional validation:

1. power the controller from the battery;
2. connect and refresh the e-paper display;
3. download the EatMe dashboard image over Wi-Fi;
4. enter deep sleep after each refresh;
5. confirm reliable wake, update and sleep cycles.

Do not use this stage to estimate final battery life.

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
indicator are enabled. This is far above the intended deep-sleep current for the
final EatMe display.

Therefore, the PowerBoost can validate:

- controller operation;
- e-paper wiring;
- Wi-Fi reliability;
- image download and refresh behaviour;
- firmware sleep sequencing.

It cannot validate:

- final standby current;
- realistic battery endurance;
- solar energy balance;
- the final charger and regulator losses.

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

Use the Waveshare 4.2-inch black-and-white 400 x 300 display for the first build.
It matches the current server image and retains its image without continuous
power.

The later solar stage favours a display that:

- retains its image when the controller sleeps;
- has negligible standby current;
- can be fully powered down after refresh;
- refreshes quickly enough to keep Wi-Fi wake time short;
- does not require a continuously powered Raspberry Pi Pico.

The 4.2-inch module meets these requirements for the prototype. A later
800 x 480 display remains optional and requires a matching server render mode.

### Enclosure and wiring

Reserve space and access for:

- the future ADA6106 board;
- a solar-panel cable;
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

Buy only the parts needed for the battery-powered display stage:

- Waveshare 4.2-inch black-and-white 400 x 300 e-paper display;
- suitable Serial Peripheral Interface leads or headers;
- removable power link or switch, if none is available;
- required connectors and enclosure hardware.

Defer these purchases until the ADA6106 is available and the prototype works:

- solar charger;
- solar panel;
- replacement controller;
- final enclosure built around the solar hardware.

## Validation sequence

1. Run the display from bench USB power.
2. Run the same hardware from the PowerBoost and LiPo.
3. Verify at least 50 wake, download, refresh and sleep cycles.
4. Measure wake duration and update reliability.
5. Replace the PowerBoost with the ADA6106 when available.
6. Measure complete-system sleep current at the battery.
7. Add the solar panel only after the regulated battery system is stable.
8. Measure harvested and consumed energy at the intended installation position.

## Primary hardware references

- [Adafruit PowerBoost 1000C guide](https://learn.adafruit.com/adafruit-powerboost-1000c-load-share-usb-charge-boost)
- [Adafruit BQ25185 charger with 5 V boost](https://www.adafruit.com/product/6106)
- [EatMe hardware research](05-hardware-research.md)
