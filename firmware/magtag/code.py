"""EatMe firmware for Adafruit MagTag (CircuitPython 10+).

Wake from a timer or optional button alarm, download one server-rendered BMP,
decode it in RAM, refresh the e-ink panel, report status, and deep-sleep. No
routine wake writes to CIRCUITPY flash.
"""

import json
import os
import time
from io import BytesIO

import alarm
import board
import digitalio
import displayio
import socketpool
import ssl
import wifi
from analogio import AnalogIn

import adafruit_imageload
import adafruit_requests


SERVER = os.getenv("EATME_SERVER", "http://homeassistant.local:8099")
TOKEN = os.getenv("EATME_TOKEN", "")
SLEEP_HOURS = float(os.getenv("EATME_SLEEP_HOURS", "12"))
FAILURE_SLEEP_MINUTES = float(os.getenv("EATME_FAILURE_SLEEP_MINUTES", "30"))
REQUEST_TIMEOUT = 15


def _setting_enabled(name, default):
    value = os.getenv(name, default)
    if isinstance(value, bool):
        return value
    return str(value).lower() in ("1", "true", "yes", "on")


BUTTON_WAKE = _setting_enabled("EATME_BUTTON_WAKE", "true")

DASHBOARD_PATH = "/api/magtag/display.bmp"
PAGE_PATH = "/api/magtag/page/{page}"
STATUS_PATH = "/api/magtag/status"
BUTTON_PATH = "/api/magtag/button"

BUTTON_ACTIONS = {
    board.BUTTON_A: "urgent",
    board.BUTTON_B: "recipe",
    board.BUTTON_C: "shopping",
    board.BUTTON_D: "refresh",
}
PAGE_IDS = {"urgent": 0, "recipe": 1, "shopping": 2}
ID_PAGES = {value: key for key, value in PAGE_IDS.items()}

# Keep the speaker and NeoPixel rail disabled during the wake and across sleep.
_power_controls = []


def _hold_output(pin_name, value):
    if not hasattr(board, pin_name):
        return
    try:
        output = digitalio.DigitalInOut(getattr(board, pin_name))
        output.direction = digitalio.Direction.OUTPUT
        output.value = value
        _power_controls.append(output)
    except ValueError:
        pass


_hold_output("SPEAKER_ENABLE", False)
_hold_output("NEOPIXEL_POWER", True)


def add_query(url, name, value):
    separator = "&" if "?" in url else "?"
    return "{}{}{}={}".format(url, separator, name, value)


def with_token(url):
    return add_query(url, "token", TOKEN) if TOKEN else url


def wake_action():
    """Return the button action that woke the board, or None for timer/boot."""
    wake_alarm = alarm.wake_alarm
    if wake_alarm is None or not hasattr(wake_alarm, "pin"):
        return None
    for button, action in BUTTON_ACTIONS.items():
        if wake_alarm.pin is button:
            return action
    return None


def read_last_page():
    return ID_PAGES.get(alarm.sleep_memory[0], "urgent")


def write_last_page(page):
    alarm.sleep_memory[0] = PAGE_IDS.get(page, 0)


def read_battery_percent():
    """Read the documented MagTag battery divider and return 0–100."""
    battery_pin = getattr(board, "BATTERY", None)
    # Retain compatibility with any older board definition that used the
    # pre-release alias, while preferring the current official name.
    if battery_pin is None:
        battery_pin = getattr(board, "VOLTAGE_MONITOR", None)
    if battery_pin is None:
        print("No battery monitor pin is available")
        return None

    monitor = AnalogIn(battery_pin)
    try:
        total = 0
        for _ in range(8):
            total += monitor.value
    finally:
        monitor.deinit()
    volts = (total / 8 / 65535.0) * 3.3 * 2
    percent = round((volts - 3.3) / (4.2 - 3.3) * 100)
    return max(0, min(100, percent))


def connect_wifi():
    ssid = os.getenv("CIRCUITPY_WIFI_SSID")
    password = os.getenv("CIRCUITPY_WIFI_PASSWORD")
    if not ssid:
        raise RuntimeError("CIRCUITPY_WIFI_SSID is not set in settings.toml")
    if not wifi.radio.connected:
        wifi.radio.connect(ssid, password, timeout=REQUEST_TIMEOUT)


def fetch_dashboard(requests, page, battery):
    path = DASHBOARD_PATH if page == "urgent" else PAGE_PATH.format(page=page)
    url = with_token(SERVER + path)
    if battery is not None:
        url = add_query(url, "battery", battery)

    response = requests.get(url, timeout=REQUEST_TIMEOUT)
    try:
        if response.status_code != 200:
            raise RuntimeError("EatMe returned HTTP {}".format(response.status_code))
        image_bytes = BytesIO(response.content)
    finally:
        response.close()

    bitmap, palette = adafruit_imageload.load(
        image_bytes,
        bitmap=displayio.Bitmap,
        palette=displayio.Palette,
    )
    if bitmap.width != 296 or bitmap.height != 128:
        raise RuntimeError("Expected a 296 x 128 MagTag image")
    return bitmap, palette


def show_bitmap(bitmap, palette):
    display = board.DISPLAY
    display.rotation = 270
    group = displayio.Group()
    group.append(displayio.TileGrid(bitmap, pixel_shader=palette))
    display.root_group = group

    for attempt in range(3):
        try:
            display.refresh()
            break
        except RuntimeError:
            if attempt == 2:
                raise
            time.sleep(2)
    while getattr(display, "busy", False):
        time.sleep(0.1)


def wifi_rssi():
    try:
        return wifi.radio.ap_info.rssi
    except (AttributeError, RuntimeError):
        return None


def report_status(requests, action, battery):
    try:
        response = requests.post(
            with_token(SERVER + STATUS_PATH),
            data=json.dumps(
                {
                    "battery": battery,
                    "wakeReason": "button:{}".format(action) if action else "timer",
                    "firmware": "eatme-magtag/0.2",
                    "rssi": wifi_rssi(),
                }
            ),
            headers={"Content-Type": "application/json"},
            timeout=REQUEST_TIMEOUT,
        )
        response.close()
        if action:
            response = requests.post(
                with_token(SERVER + BUTTON_PATH),
                data=json.dumps({"button": action}),
                headers={"Content-Type": "application/json"},
                timeout=REQUEST_TIMEOUT,
            )
            response.close()
    except Exception as error:
        print("Status report failed:", error)


def deep_sleep(seconds):
    print("Sleeping for", seconds, "seconds")
    wifi.radio.enabled = False
    alarms = [alarm.time.TimeAlarm(monotonic_time=time.monotonic() + seconds)]
    if BUTTON_WAKE:
        alarms.extend(
            alarm.pin.PinAlarm(pin=pin, value=False, pull=True) for pin in BUTTON_ACTIONS
        )
    alarm.exit_and_deep_sleep_until_alarms(*alarms)


def main():
    if alarm.wake_alarm is None:
        alarm.sleep_memory[0] = PAGE_IDS["urgent"]

    action = wake_action()
    page = read_last_page() if action == "refresh" else (action or "urgent")
    battery = read_battery_percent()
    success = False

    try:
        connect_wifi()
        pool = socketpool.SocketPool(wifi.radio)
        requests = adafruit_requests.Session(pool, ssl.create_default_context())
        bitmap, palette = fetch_dashboard(requests, page, battery)
        show_bitmap(bitmap, palette)
        write_last_page(page)
        report_status(requests, action, battery)
        success = True
    except Exception as error:
        print("Wake cycle failed:", error)

    sleep_seconds = SLEEP_HOURS * 3600 if success else FAILURE_SLEEP_MINUTES * 60
    deep_sleep(sleep_seconds)


main()
