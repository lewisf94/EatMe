# Hardware parts list

Last reviewed: 28 July 2026

This is the practical buying list for the optional EatMe e-paper display. The
supporting measurements, alternatives and sources are in the
[hardware research](05-hardware-research.md).

## No new server hardware

EatMe already runs on the Raspberry Pi hosting Home Assistant. No second server
is required.

## First e-paper prototype

| Qty | Part | Selection |
|---:|---|---|
| 1 | Controller | Tenstar Robot ESP32-C6 Super Mini already owned |
| 1 | Display | Waveshare Pico-ePaper-4.2, black/white, 400 x 300, preferably V2 |
| 1 | Solar charger | Adafruit bq25185 USB/DC/Solar Charger with 5 V Boost, product 6106 |
| 1 | Battery | Protected 3.7 V LiPo, at least 2,000 mAh, verified JST-PH polarity |
| 1 | Solar panel | Voltaic P123, 6 V-class, 0.64 W, 66 x 66 mm |
| 1 | Power isolator | Inline switch or removable link between the charger and controller |
| 1 | Display lead | Eight-way SPI cable or individual jumper wires |
| 1 | Programming cable | USB-C data cable |
| 1 | Test tool | Multimeter capable of checking polarity and current |
| 1 | Enclosure | Keeps the battery shaded, supported and away from sharp edges |

The display has a Raspberry Pi Pico header, but it also exposes standard SPI.
The Pico is therefore not required.

## Controller choices after measuring the prototype

| Priority | Controller | Why |
|---|---|---|
| Lowest cost | Existing Tenstar ESP32-C6 | Already owned; keep it if the complete device sleeps below about 50 uA |
| Lowest measured sleep | DFRobot FireBeetle ESP32 DFR0478 | Advertised 10 uA and independently reported at 11 uA; £9.50 price supplied during research |
| Smallest documented board | Seeed XIAO ESP32-C6 | 21 x 17.8 mm and 15 uA published board sleep |
| Most convenient older ESP32 | DFRobot FireBeetle 2 ESP32-E DFR0654 | USB-C, more I/O and GDI, but its 10 uA retailer claim conflicts with current DFRobot documentation |
| Simplest integrated solar board | DFRobot FireBeetle 2 ESP32-C6 | Dedicated 5 V solar input, charger and battery measurement; current v1.2 is specified at 36 uA sleep |

Do not replace the existing controller until its actual sleep current, Wi-Fi
connection time and update energy have been measured. The 5 uA difference
between a 10 uA FireBeetle and a 15 uA XIAO C6 is only 43.8 mAh per year.

The DFR0654 needs its documented low-power jumper cut to reach its lowest sleep
state. This is a physical modification. Retailers state 10 uA, historical
documentation states 13 uA, and the current DFRobot page states 2 mA, so the
delivered revision must be measured before it is selected.

## Safe power path

```text
Voltaic P123 solar panel
  -> bq25185 solar input
protected LiPo
  -> bq25185 battery socket
bq25185 regulated 5 V output
  -> isolation switch
  -> controller 5 V input
controller 3.3 V
  -> e-paper VCC
all grounds common
```

Use the bq25185 as the only battery charger. Leave the controller's battery
connector unused in this arrangement. Disconnect the external 5 V link before
plugging the controller into USB for programming. Never connect two charger
outputs to the same cell, never connect a solar panel directly to a LiPo, and
verify JST polarity before connection.

## Refined display option

After the server gains an 800 x 480 render profile, use the Waveshare 3.97-inch
black/white 800 x 480 HAT+. It is sharper and narrower than the 4.2-inch
prototype. The 4.26-inch Waveshare 800 x 480 panel is the larger alternative.

## QR labels

The app already generates printable A4 QR-label sheets. Start with normal paper
under clear tape or full-sheet self-adhesive paper. A dedicated Bluetooth label
printer is not required for the current flow.

## NFC

NTAG213 stickers can store the same EatMe item URL as a QR code, but NFC writing
is not implemented in the app. Treat NFC as a later optional enhancement rather
than a first purchase.

## Suggested order

1. Build the mains-powered bench prototype using the Tenstar and 4.2-inch
   display.
2. Measure sleep current, Wi-Fi connection time and one complete refresh.
3. Add the bq25185 and protected LiPo.
4. Add the P123 panel and log energy at the intended mounting position.
5. Only then buy a replacement controller or final display.
