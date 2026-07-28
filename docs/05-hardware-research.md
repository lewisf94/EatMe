# EatMe e-paper hardware research

Last reviewed: 28 July 2026

This document records the evidence behind the controller, display, solar and
battery recommendations for EatMe's optional kitchen display. Product prices and
availability change; the electrical specifications and physical dimensions
should be checked again before ordering.

## Recommendation

Build the first prototype with the **Tenstar Robot ESP32-C6 Super Mini already
owned**, a **Waveshare Pico-ePaper-4.2 black/white display**, an **Adafruit
bq25185 solar charger with 5 V boost**, a protected **2,000 mAh LiPo** and a
**Voltaic P123 6 V, 0.64 W panel**.

This is the lowest-risk first build because:

- the controller is already available;
- the display's 400 x 300 resolution exactly matches EatMe's current
  `/api/display.png` output;
- the display also exposes an eight-pin SPI connector, so its Pico header does
  not require a Raspberry Pi Pico;
- the charger has a defined solar input, load sharing and regulated 5 V output;
- the 66 x 66 mm panel fits within the 93.5 x 78.5 mm display-board footprint.

Do not buy a replacement controller until the Tenstar board's complete-system
sleep current and Wi-Fi update time have been measured. If it sleeps above
100 uA, is inconsistent between units, or struggles to join Wi-Fi promptly,
replace it with a measured branded board.

For a refined second version, the preferred display is the **Waveshare
3.97-inch black/white 800 x 480 display**. The **Seeed XIAO ESP32-C6** remains
the best compact controller, while the original **DFRobot FireBeetle ESP32
DFR0478** is the most interesting battery-life alternative if its larger
footprint and Micro-USB connector are acceptable. EatMe needs an 800 x 480
render profile before this display can replace the 400 x 300 prototype.

## C3 versus C6 efficiency

The bare ESP32-C3 chip is marginally better in deep sleep:

| SoC | Espressif deep-sleep figure | Difference over one year |
|---|---:|---:|
| ESP32-C3 | 5 uA | Baseline |
| ESP32-C6 | 7 uA | About 17.5 mAh more per year |

The two-microamp difference is less than one percent of a 2,000 mAh battery.
Complete-board design matters much more. On the directly comparable Seeed XIAO
boards, Seeed publishes **44 uA for the C3 board** and **15 uA for the C6
board**. The XIAO C6 therefore saves about 254 mAh per year while sleeping,
despite the C3 chip having the lower bare-chip figure.

Sources:

- [Espressif ESP32-C3 datasheet](https://documentation.espressif.com/esp32-c3_datasheet_en.html)
- [Espressif ESP32-C6 datasheet](https://documentation.espressif.com/esp32-c6_datasheet_en.html)
- [Seeed XIAO ESP32-C6 specifications and comparison](https://wiki.seeedstudio.com/xiao_esp32c6_getting_started/)

## Controller-board comparison

| Board | Size | Published board deep sleep | Battery/solar features | Assessment |
|---|---:|---:|---|---|
| **Seeed XIAO ESP32-C6** | 21 x 17.8 mm | **15 uA** | LiPo charging; solar needs a separate controller | Best compact final controller |
| Seeed XIAO ESP32-C3 | 21 x 17.8 mm | 44 uA | LiPo charging; solar needs a separate controller | The C3 chip does not make this board more efficient |
| **DFRobot FireBeetle ESP32 DFR0478** | 29 x 58 mm | Advertised 10 uA; one independent report measured 11 uA | LiPo and USB charging; no documented solar input | Best evidence for very low sleep, but older and larger |
| **DFRobot FireBeetle 2 ESP32-E DFR0654** | 25.4 x 60 mm | Retailers claim 10 uA; historical documentation says 13 uA; current official page says 2 mA | LiPo and USB charging; no documented solar input | Better connector and I/O than DFR0478, but verify the delivered revision |
| **DFRobot FireBeetle 2 ESP32-C6 v1.2** | 25.4 x 60 mm | 36 uA | LiPo charging, battery measurement and specified 5 V solar input | Simplest all-in-one solar board, but larger |
| Waveshare ESP32-C6-Zero | Approximately 24 x 18 mm | Not published | No LiPo charger | Well documented, but no power-system advantage |
| Tenstar Robot ESP32-C6 Super Mini | Approximately 26 x 18 mm | Not credibly published | Revision-dependent | Use for the prototype and measure it |
| Raspberry Pi Pico 2 W | 51 x 21 mm | Not competitive or clearly supported for this ESPHome sleep design | No solar charger | Not recommended solely to fit the Pico display header |

The XIAO C6 also provides 512 KB SRAM, 4 MB flash, an external-antenna option
and LiPo charge management. Its battery connection uses solder pads, and its 5 V
pin is not powered when running from its BAT input.

### Original FireBeetle versus FireBeetle 2 ESP32-E

At the Pi Hut price supplied during this research, both boards cost £9.50. They
use closely related dual-core ESP32 modules with Wi-Fi 4 and Bluetooth 4.2, so
their application performance and approximately 80 mA average operating-current
figures are similar. Neither needs the newer C6 radio features for EatMe's
current Wi-Fi-only display.

| Detail | FireBeetle ESP32 DFR0478 | FireBeetle 2 ESP32-E DFR0654 |
|---|---|---|
| Connector | Micro-USB | USB-C |
| Size | 29 x 58 mm | 25.4 x 60 mm |
| Flash | 16 MB | 4 MB |
| Exposed I/O | 10 digital and 5 analogue in the default map | 18 digital and 11 analogue |
| Display connection | Normal SPI pins | Normal SPI plus DFRobot GDI |
| Low-power preparation | Firmware and peripheral shutdown | Firmware shutdown plus cutting the documented low-power jumper |
| Sleep-current evidence | Advertised 10 uA; an owner measured 11 uA | Retailers advertise 10 uA; older documentation says 13 uA; current official documentation says 2 mA |
| Solar charging | No documented solar tracking or MPPT | No documented solar tracking or MPPT; DFRobot's FAQ says the battery charges through USB only |
| Other caveat | Check the LiPo connector polarity on the delivered revision | FireBeetle 1 and 2 pins, dimensions and expansion boards are incompatible |

The DFR0654 is the nicer development board: it has USB-C, more exposed pins and
a display connector. Those conveniences do not prove lower energy use. Its
headline 10 uA figure conflicts with current DFRobot documentation, and a user
measured 468 uA before remembering to cut the low-power jumper. Historical
documentation and a later independent report indicate low tens of microamps can
be achieved after the modification, but every delivered revision should be
measured.

The DFR0478 has the stronger low-power evidence: an independent Nordic Power
Profiler measurement reported 11 uA. It also has four times the flash, although
EatMe does not need 16 MB. Its disadvantages are Micro-USB, fewer convenient
pins and a slightly wider board.

A difference between 10 uA and the XIAO C6's published 15 uA consumes only
43.8 mAh per year, about 2.2% of a nominal 2,000 mAh battery. Wi-Fi association
time, the regulator and boost converter, battery self-discharge, failed updates
and solar conversion losses can each be more important. Therefore:

1. Use the owned Tenstar C6 for the first prototype.
2. Choose DFR0478 when measured battery life is the priority and the larger
   board is acceptable.
3. Choose XIAO ESP32-C6 when enclosure size, USB-C-era hardware and an external
   antenna option matter more than the possible 5 uA saving.
4. Choose DFR0654 only after measuring the exact unit; do not buy it solely for
   the retailer's 10 uA claim.
5. Choose FireBeetle 2 ESP32-C6 when an integrated, explicitly documented solar
   input is more valuable than the lowest sleep current.

The current FireBeetle 2 ESP32-C6 v1.2 documentation specifies 36 uA sleep,
compared with 16 uA for the older v1.0. Its solar input is documented for a
**5 V solar panel**. Do not assume that a panel with a 7.1 V open-circuit
voltage is safe for that input without confirmation from DFRobot.

The Waveshare C6-Zero has good schematics and documentation but no onboard
battery charger or published complete-board sleep measurement. It is not a
meaningful upgrade over the Tenstar board already owned.

Generic boards are not automatically equivalent to branded boards using the
same ESP32 chip. The regulator, power LED, addressable LED, USB components,
charger, antenna layout, protection and even component population can change
between revisions. A generic board may work perfectly, but its sleep current and
RF performance must be measured rather than inferred from the ESP32 datasheet.

Sources:

- [Seeed XIAO ESP32-C3 documentation](https://wiki.seeedstudio.com/XIAO_ESP32C3_Getting_Started/)
- [DFRobot FireBeetle ESP32 DFR0478 documentation](https://wiki.dfrobot.com/dfr0478/)
- [DFRobot FireBeetle 2 ESP32-E DFR0654 documentation](https://wiki.dfrobot.com/dfr0654/)
- [DFRobot DFR0654 charging FAQ](https://www.dfrobot.com/forum/topic/315558)
- [Independent DFR0478 and FireBeetle 2 sleep-current measurements](https://www.dfrobot.com/forum/topic/344118)
- [Independent DFR0654 low-power-jumper test](https://forum.arduino.cc/t/deep-sleep-current-for-firebeetle-2-esp32-e-too-high/1100878)
- [DFRobot FireBeetle 2 ESP32-C6 documentation](https://wiki.dfrobot.com/dfr1075/)
- [Waveshare ESP32-C6-Zero documentation](https://docs.waveshare.com/ESP32-C6-Zero)
- [Raspberry Pi Pico 2 datasheet](https://datasheets.raspberrypi.com/pico/pico-2-datasheet.pdf)
- [ESPHome deep-sleep support](https://esphome.io/components/deep_sleep/)

## E-paper comparison

Use a black-and-white panel. Three- and four-colour panels usually take
approximately 15 to 21 seconds to refresh, often lack partial refresh and add
software complexity without improving EatMe's inventory dashboard.

| Display | Resolution | Module/panel size | Full/partial refresh | Assessment |
|---|---:|---:|---:|---|
| **Waveshare 3.97-inch B/W HAT+** | 800 x 480 | 99.5 x 60 mm with driver | 3.5 s / 0.6 s | Best final display: sharp and compact |
| **Waveshare Pico-ePaper-4.2 B/W** | 400 x 300 | 93.5 x 78.5 mm | 5 s / 0.4 s | Best prototype: exact match for current EatMe output |
| Waveshare 4.26-inch B/W | 800 x 480 | Approximately 107 x 64 mm | About 4 s / 0.7 s | Larger alternative with the same sharp resolution |
| Good Display GDEY042T81 | 400 x 300 | 91 x 77 mm raw panel | 2 s / 0.3 s | Fast custom-build panel; requires a separate driver PCB |
| Waveshare 3.7-inch B/W | 480 x 280 | 54.9 x 93.3 mm raw panel | 3 s / 0.3 s | Narrower dashboard area; less suitable for EatMe |

The Waveshare 3.97-inch module consumes less than 40 mW during refresh and
specifies less than 0.01 uA standby current. Its 800 x 480 resolution is the best
balance of readability, enclosure size and dashboard detail.

The Pico-ePaper-4.2 consumes about 26.4 mW during refresh and retains its image
without power. It provides a separate SPI connector for non-Pico controllers.
The V2 hardware also provides a 1.5-second fast-refresh mode.

Both the Waveshare 3.97-inch and 4.26-inch black-and-white displays appear in
ESPHome's supported e-paper model list. Good Display's raw panel is attractive
for a later custom PCB, not for the first hand-wired build.

Sources:

- [Waveshare 3.97-inch B/W HAT+](https://www.waveshare.com/3.97inch-e-paper-hat-plus.htm)
- [Waveshare Pico-ePaper-4.2 B/W](https://www.waveshare.com/pico-epaper-4.2.htm)
- [Waveshare 4.26-inch B/W HAT](https://www.waveshare.com/4.26inch-e-paper-hat.htm)
- [Good Display GDEY042T81](https://www.good-display.com/product/386.html)
- [ESPHome e-paper model list](https://esphome.io/components/display/epaper_spi/)

## Compact solar-panel comparison

### Bright window or outdoor light

| Panel | Dimensions | Peak rating | Fit with the recommended displays |
|---|---:|---:|---|
| Voltaic P122 | 52 x 52 mm | 0.33 W | Fits easily; least margin in winter or poor orientation |
| **Voltaic P123** | **66 x 66 mm** | **0.64 W** | Best size/output balance; fits behind the 4.2-inch module |
| Voltaic P124 | 66 x 113 mm | 1.2 W | Better poor-light margin; extends 13.5 to 19.5 mm beyond the display length |

The P123 is the default recommendation. It is a 6 V-class, 22%-efficiency ETFE
panel with a 7.1 V open-circuit voltage and 0.64 W peak rating. It remains close
to the display footprint without throwing away as much winter and angle margin
as the smaller P122.

Choose the P124 only when the installation has poor orientation, substantial
shading or a strong requirement to minimise manual top-ups. Its overhang is
modest but visible.

Source: [Voltaic standard panel dimensions and electrical data](https://voltaicsystems.com/small-solar-panels/)

### Ordinary indoor light

Outdoor panel wattages are rated in strong sunlight and should not be used to
predict output under room lighting. A dedicated indoor photovoltaic material is
more effective.

Epishine's 50 x 50 mm MC15 indoor cell specifies:

- 175 uW at 200 lux;
- typical power density of 7.6 uW/cm2 at 200 lux;
- typical power density of 20.3 uW/cm2 at 500 lux.

Eight hours at 200 lux yields only about 1.4 mWh before conversion losses. A
realistic engineering estimate for a XIAO C6 system waking once per day is
approximately 2 to 4 mWh/day, depending on Wi-Fi association time, signal
strength, regulator losses and charger overhead. A single 50 x 50 mm indoor cell
is therefore unlikely to sustain the system in a dim room. At 500 lux it may be
viable, but the installation must be measured.

The DFRobot 45 x 45 mm indoor harvester kit is useful for experiments, but its
80 mA regulated-output limit is below ESP32 Wi-Fi transmit peaks. It requires an
appropriate battery or capacitor buffer and is not a direct replacement for the
recommended LiPo power path.

Sources:

- [Epishine MultiCell indoor photovoltaic datasheet](https://www.epishine.com/hubfs/MultiCell_Data_Sheet_2.1.pdf)
- [DFRobot indoor energy-harvesting kit](https://www.dfrobot.com/product-2846.html)
- [DFRobot 50 x 50 mm indoor photovoltaic film](https://www.dfrobot.com/product-2858.html)

## Solar charger and battery

For the Tenstar prototype, use the **Adafruit bq25185 USB/DC/Solar Charger with
5 V Boost, product 6106**. It accepts a 5 to 18 V solar input, provides
solar-voltage tracking, load sharing and a regulated 5 V output. That lets it be
the only battery charger while the Tenstar BAT pads remain unused.

Use a reputable, protected single-cell LiPo of at least 2,000 mAh with a
verified JST-PH polarity. Set the charger to 500 mA unless the battery
manufacturer explicitly permits the default 1 A rate.

Power architecture:

```text
solar panel -> bq25185 solar input
protected LiPo -> bq25185 battery socket
bq25185 regulated 5 V output -> isolation switch -> controller 5 V input
controller 3.3 V -> e-paper VCC
all grounds common
```

Disconnect or switch off the external 5 V link before connecting the
controller's own USB port for programming. Never attach two charger outputs to
the same cell. Verify battery and panel polarity with a multimeter before
connection, and keep the LiPo shaded even if the solar panel is in direct sun.

Sources:

- [Adafruit bq25185 charger with 5 V boost](https://www.adafruit.com/product/6106)
- [Adafruit bq25185 guide](https://learn.adafruit.com/adafruit-bq25185-usb-dc-solar-lithium-ion-polymer-charger)
- [Texas Instruments bq25185](https://www.ti.com/product/BQ25185)

## Prototype purchasing list

| Qty | Part | Requirement |
|---:|---|---|
| 1 | Tenstar Robot ESP32-C6 Super Mini | Already owned |
| 1 | Waveshare Pico-ePaper-4.2 | Black/white, 400 x 300, preferably V2 |
| 1 | Adafruit bq25185 charger with 5 V boost | Product 6106 |
| 1 | Protected LiPo | 3.7 V, at least 2,000 mAh, correct JST-PH polarity |
| 1 | Voltaic P123 | 6 V-class, 0.64 W, 66 x 66 mm |
| 1 | Inline switch or removable power link | Isolates external 5 V during USB programming |
| 1 | Eight-way SPI lead or individual jumper wires | Match the e-paper connector |
| 1 | USB-C data cable | Programming |
| 1 | Multimeter | Polarity and current validation |
| 1 | Enclosure/frame | Keep the LiPo away from direct sun and sharp edges |

The battery-voltage monitor is optional for the first bench test. If fitted, use
a high-resistance divider and capacitor so the monitor does not consume a
material fraction of the sleeping current.

## Validation before finalising the controller

Measure the completed system at the battery, not just the ESP32 chip:

1. deep-sleep current after LEDs and peripherals have been disabled;
2. wake-to-Wi-Fi time;
3. total energy for one image download and display refresh;
4. failed-connection timeout behaviour;
5. energy harvested per day in the intended mounting position.

Keep the Tenstar board if sleep is below approximately 50 uA and a normal update
finishes within 15 seconds. If sleep exceeds 100 uA, Wi-Fi performance is
inconsistent, or board revisions produce materially different results, compare
a DFR0478 and XIAO C6 using the same firmware and power path. Values between
those thresholds should be decided using the measured daily energy budget
rather than the chip name.

Solar should be described as **solar-assisted** until a winter test at the real
installation location demonstrates that harvested energy exceeds consumption.
