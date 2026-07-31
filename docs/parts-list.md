# Hardware parts list

Last reviewed: 31 July 2026

This is the active buying list for the optional EatMe e-paper display. The
current staged power plan is in [06-eink-power-plan.md](06-eink-power-plan.md).
The broader research remains in [05-hardware-research.md](05-hardware-research.md).

## No new server hardware

EatMe already runs on the Raspberry Pi hosting Home Assistant. No second server
is required.

## Stage 1: battery-powered prototype

Use the owned battery hardware. Do not buy solar parts yet.

| Qty | Part | Selection |
|---:|---|---|
| 1 | Controller | Tenstar Robot ESP32-C6 Super Mini, already owned |
| 1 | Display | Waveshare Pico-ePaper-4.2, black/white, 400 x 300, preferably V2 |
| 1 | Temporary power board | Adafruit PowerBoost 1000C, already owned |
| 1 | Battery | Protected single-cell LiPo, already owned; verify connector polarity |
| 1 | Power isolator | Inline switch, jumper or removable link between PowerBoost and controller |
| 1 | Display lead | Eight-way Serial Peripheral Interface cable or individual jumper wires |
| 1 | Programming cable | USB-C data cable for the Tenstar |
| 1 | Charger cable | USB-C supply to Micro-B cable for the PowerBoost, if required |
| 1 | Test tool | Multimeter capable of checking voltage, polarity and current |
| 1 | Temporary enclosure | Keep the battery supported and away from sharp edges |

The display has a Raspberry Pi Pico header, but it also exposes standard Serial
Peripheral Interface connections. A Raspberry Pi Pico is not required.

## Temporary power path

```text
protected LiPo
  -> PowerBoost 1000C battery connector
PowerBoost approximately 5.2 V output
  -> isolation switch or removable link
  -> Tenstar 5V input
Tenstar 3.3 V
  -> e-paper VCC
all grounds common
```

Connect the battery only to the PowerBoost during this stage. Leave the Tenstar
battery pads unused.

Open the external 5 V link before connecting the Tenstar USB-C port. Do not
connect two 5 V sources unless the board power path has been verified.

The PowerBoost is suitable for functional testing. Its approximately 5 mA
standby load makes it unsuitable for final battery-life measurements.

## Stage 2: planned solar upgrade

When available, replace the PowerBoost with:

| Qty | Part | Planned selection |
|---:|---|---|
| 1 | Solar charger and supply | Adafruit BQ25185 USB/DC/Solar Charger with 5 V Boost, ADA6106 |
| 1 | Solar panel | 5 to 7 V panel, selected after installation-light measurements |
| 1 | Final enclosure | Space for ADA6106, solar cable, USB-C access and shaded LiPo |

Planned power path:

```text
5 to 7 V solar panel
  -> ADA6106 solar input
USB-C top-up
  -> ADA6106 USB-C input
protected LiPo
  -> ADA6106 battery connector
ADA6106 regulated 5 V output
  -> isolation switch or removable link
  -> controller 5V input
controller 3.3 V
  -> e-paper VCC
all grounds common
```

Use the ADA6106 as the only battery charger. Leave the controller battery
connection unused.

Describe the system as solar-assisted until testing at the real installation
position proves energy neutrality through winter.

## Controller choice

Do not buy a replacement controller yet.

Keep the Tenstar if it provides reliable Wi-Fi updates and acceptable sleep
current after the final power board is fitted.

The Seeed XIAO ESP32-C6 remains the preferred compact fallback. A replacement
controller must:

- accept regulated 5 V from the future ADA6106;
- support reliable ESP32 deep sleep;
- expose enough Serial Peripheral Interface pins;
- avoid high-current always-on indicators and regulators;
- permit safe isolation from external 5 V during USB programming.

The future solar plan does not require an onboard battery charger. The ADA6106
will provide charging and power-path control.

## Display choice

Use the Waveshare 4.2-inch black-and-white 400 x 300 display for Stage 1. It
matches the current server output and retains its image without continuous
power.

After the server gains an 800 x 480 render profile, the Waveshare 3.97-inch
black-and-white 800 x 480 HAT+ remains a possible refined display.

## QR labels

The app already generates printable A4 Quick Response code label sheets. Start
with normal paper under clear tape or full-sheet self-adhesive paper.

## Purchase order

1. Buy the 4.2-inch black-and-white display and required connection hardware.
2. Build a USB-powered bench prototype.
3. Run it from the owned PowerBoost and LiPo.
4. Verify at least 50 wake, download, refresh and sleep cycles.
5. Buy the ADA6106 when stock returns.
6. Measure complete-system sleep current with the final charger fitted.
7. Select and add a solar panel only after the battery system is stable.
