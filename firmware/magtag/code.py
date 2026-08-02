# EatMe MagTag display firmware (CircuitPython 10+).
#
# Wakes (from a timer or a button), fetches the rendered dashboard from the
# EatMe server as a BMP, draws it, reports optional status, and returns to
# deep sleep. All layout lives on the server
# (apps/server/src/services/magtagDisplay.ts) — this firmware never parses
# inventory data itself, so a dashboard redesign never means reflashing.
#
# Configure via settings.toml (copy settings.toml.example and fill it in).
#
# UNVERIFIED ON HARDWARE: written against the documented MagTag pinout and
# CircuitPython 10 APIs, but this repository has no MagTag to test against.
# Before relying on it, work through firmware/magtag/README.md's checklist —
# in particular the button-to-pin mapping and the battery-monitor pin name.
import json
import os
import time

import alarm
import board
import displayio
import socketpool
import ssl
import wifi

import adafruit_requests

SERVER = os.getenv("EATME_SERVER", "http://homeassistant.local:8099")
TOKEN = os.getenv("EATME_TOKEN", "")
SLEEP_HOURS = float(os.getenv("EATME_SLEEP_HOURS", "12"))
REQUEST_TIMEOUT = 15  # seconds — a bounded failure still goes to deep sleep

DASHBOARD_PATH = "/api/magtag/display.bmp"
PAGE_PATH = "/api/magtag/page/{page}"
STATUS_PATH = "/api/magtag/status"
BUTTON_PATH = "/api/magtag/button"

BMP_FILE = "/dashboard.bmp"
LAST_PAGE_FILE = "/last_page.txt"

# Button A/B/C/D select urgent food / recipe / shopping / manual refresh, per
# docs/07-magtag-plan.md. All four are wake-capable pins on the MagTag, so a
# press while the board is asleep is what triggers a wake in the first place.
BUTTON_ACTIONS = {
    board.BUTTON_A: "urgent",
    board.BUTTON_B: "recipe",
    board.BUTTON_C: "shopping",
    board.BUTTON_D: "refresh",
}


def with_token(url):
    if not TOKEN:
        return url
    sep = "&" if "?" in url else "?"
    return f"{url}{sep}token={TOKEN}"


def wake_action():
    """Which button (if any) woke the board. None means a timer wake."""
    wake_alarm = alarm.wake_alarm
    if wake_alarm is None or not hasattr(wake_alarm, "pin"):
        return None
    for button, action in BUTTON_ACTIONS.items():
        if wake_alarm.pin is button:
            return action
    return None


def read_last_page():
    try:
        with open(LAST_PAGE_FILE, "r") as f:
            page = f.read().strip()
            return page or "urgent"
    except OSError:
        return "urgent"


def write_last_page(page):
    try:
        with open(LAST_PAGE_FILE, "w") as f:
            f.write(page)
    except OSError as exc:
        print("Could not persist last page (read-only filesystem?):", exc)


def read_battery_percent():
    """0-100 from the LiPo divider, or None if the board has no monitor pin
    under this name — see README.md if this needs correcting for your unit."""
    try:
        import analogio

        with analogio.AnalogIn(board.VOLTAGE_MONITOR) as pin:
            volts = (pin.value / 65536) * pin.reference_voltage * 2
    except (AttributeError, ImportError) as exc:
        print("No battery monitor available:", exc)
        return None
    pct = round((volts - 3.3) / (4.2 - 3.3) * 100)
    return max(0, min(100, pct))


def connect_wifi():
    ssid = os.getenv("CIRCUITPY_WIFI_SSID")
    password = os.getenv("CIRCUITPY_WIFI_PASSWORD")
    if not ssid:
        raise RuntimeError("CIRCUITPY_WIFI_SSID is not set in settings.toml")
    wifi.radio.connect(ssid, password, timeout=REQUEST_TIMEOUT)


def fetch_dashboard(requests, page):
    path = DASHBOARD_PATH if page == "urgent" else PAGE_PATH.format(page=page)
    url = with_token(SERVER + path)
    response = requests.get(url, timeout=REQUEST_TIMEOUT)
    try:
        if response.status_code != 200:
            raise RuntimeError(f"{url} -> HTTP {response.status_code}")
        with open(BMP_FILE, "wb") as f:
            f.write(response.content)
    finally:
        response.close()


def show_bitmap():
    display = board.DISPLAY
    bitmap = displayio.OnDiskBitmap(BMP_FILE)
    tile_grid = displayio.TileGrid(bitmap, pixel_shader=bitmap.pixel_shader)
    group = displayio.Group()
    group.append(tile_grid)
    display.root_group = group
    try:
        display.refresh()
    except RuntimeError:
        pass  # a root_group change can already schedule a refresh on its own
    while display.busy:
        time.sleep(0.1)


def report_status(requests, page, action, battery):
    try:
        requests.post(
            with_token(SERVER + STATUS_PATH),
            data=json.dumps(
                {
                    "battery": battery,
                    "wakeReason": f"button:{action}" if action else "timer",
                    "firmware": "eatme-magtag/0.1",
                }
            ),
            headers={"Content-Type": "application/json"},
            timeout=REQUEST_TIMEOUT,
        ).close()
        if action:
            requests.post(
                with_token(SERVER + BUTTON_PATH),
                data=json.dumps({"button": action}),
                headers={"Content-Type": "application/json"},
                timeout=REQUEST_TIMEOUT,
            ).close()
    except Exception as exc:  # noqa: BLE001 — status reporting is best-effort
        print("Status report failed:", exc)


def deep_sleep():
    time_alarm = alarm.time.TimeAlarm(monotonic_time=time.monotonic() + SLEEP_HOURS * 3600)
    # value=False + pull=True: these buttons pull the pin low when pressed.
    pin_alarms = [
        alarm.pin.PinAlarm(pin=pin, value=False, pull=True) for pin in BUTTON_ACTIONS
    ]
    alarm.exit_and_deep_sleep_until_alarms(time_alarm, *pin_alarms)


def main():
    action = wake_action()
    page = read_last_page() if action == "refresh" else (action or "urgent")
    battery = read_battery_percent()

    try:
        connect_wifi()
        pool = socketpool.SocketPool(wifi.radio)
        requests = adafruit_requests.Session(pool, ssl.create_default_context())
        fetch_dashboard(requests, page)
        show_bitmap()
        write_last_page(page)
        report_status(requests, page, action, battery)
    except Exception as exc:  # noqa: BLE001 — any failure here is bounded: sleep and retry next wake
        print("Wake cycle failed:", exc)

    deep_sleep()


main()
