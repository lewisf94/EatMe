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
import microcontroller
import socketpool
import ssl
import wifi
from analogio import AnalogIn

import adafruit_imageload
import adafruit_requests


SERVER = os.getenv("EATME_SERVER", "http://homeassistant.local:8099").rstrip("/")
TOKEN = os.getenv("EATME_TOKEN", "")
REQUEST_TIMEOUT = 15
ETAG_START = 1
ETAG_LENGTH = 16
# A full e-paper refresh takes a few seconds; this only bounds a stuck panel.
PANEL_BUSY_TIMEOUT = 30


def _bounded_number(name, default, minimum, maximum):
    try:
        value = float(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        print(name, "is invalid; using", default)
        value = default
    return max(minimum, min(maximum, value))


SLEEP_HOURS = _bounded_number("EATME_SLEEP_HOURS", 12, 0.25, 168)
FAILURE_SLEEP_MINUTES = _bounded_number(
    "EATME_FAILURE_SLEEP_MINUTES", 30, 1, 1440
)


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


def quote_query(value):
    encoded = []
    safe = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"
    for byte in str(value).encode("utf-8"):
        char = chr(byte)
        encoded.append(char if char in safe else "%{:02X}".format(byte))
    return "".join(encoded)


def add_query(url, name, value):
    separator = "&" if "?" in url else "?"
    return "{}{}{}={}".format(
        url, separator, quote_query(name), quote_query(value)
    )


def with_token(url):
    return add_query(url, "token", TOKEN) if TOKEN else url


def safe_error(error):
    text = str(error)
    if TOKEN:
        text = text.replace(TOKEN, "[REDACTED]")
        text = text.replace(quote_query(TOKEN), "[REDACTED]")
    return text


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


def read_cached_etag(page):
    """Return the last strong ETag for this page from retained sleep memory."""
    if read_last_page() != page:
        return None
    try:
        raw = bytes(
            alarm.sleep_memory[ETAG_START : ETAG_START + ETAG_LENGTH]
        ).decode("ascii")
    except (UnicodeError, ValueError):
        return None
    if len(raw) != ETAG_LENGTH or any(
        char not in "0123456789abcdef" for char in raw
    ):
        return None
    return '"{}"'.format(raw)


def clear_page_cache(page="urgent"):
    """Forget the retained validator so the next fetch is unconditional.

    NUL bytes fail the hex check in read_cached_etag, so this cannot be
    mistaken for a real server validator.
    """
    write_last_page(page)
    for offset in range(ETAG_LENGTH):
        alarm.sleep_memory[ETAG_START + offset] = 0


def write_page_cache(page, etag):
    """Retain one page validator across deep sleep without writing flash."""
    raw = str(etag or "").strip('"')
    if len(raw) != ETAG_LENGTH or any(
        char not in "0123456789abcdef" for char in raw
    ):
        clear_page_cache(page)
        return
    write_last_page(page)
    for offset, byte in enumerate(raw.encode("ascii")):
        alarm.sleep_memory[ETAG_START + offset] = byte


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


def fetch_dashboard(requests, page, battery, allow_not_modified=True):
    path = DASHBOARD_PATH if page == "urgent" else PAGE_PATH.format(page=page)
    url = with_token(SERVER + path)
    if battery is not None:
        url = add_query(url, "battery", battery)

    cached_etag = read_cached_etag(page) if allow_not_modified else None
    response = (
        requests.get(
            url,
            headers={"If-None-Match": cached_etag},
            timeout=REQUEST_TIMEOUT,
        )
        if cached_etag
        else requests.get(url, timeout=REQUEST_TIMEOUT)
    )
    try:
        if response.status_code == 304 and cached_etag:
            return None, None, cached_etag, False
        if response.status_code != 200:
            raise RuntimeError("EatMe returned HTTP {}".format(response.status_code))
        payload = response.content
        etag = response.headers.get("ETag") or response.headers.get("etag")
        if len(payload) < 54 or len(payload) > 65536:
            raise RuntimeError("EatMe returned an invalid MagTag image size")
        image_bytes = BytesIO(payload)
    finally:
        response.close()

    bitmap, palette = adafruit_imageload.load(
        image_bytes,
        bitmap=displayio.Bitmap,
        palette=displayio.Palette,
    )
    if bitmap.width != 296 or bitmap.height != 128:
        raise RuntimeError("Expected a 296 x 128 MagTag image")
    return bitmap, palette, etag, True


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
    # Bounded: a panel whose busy line never clears must not hold the board
    # awake, because skipping deep sleep costs orders of magnitude more energy
    # than a partially refreshed image does.
    deadline = time.monotonic() + PANEL_BUSY_TIMEOUT
    while getattr(display, "busy", False):
        if time.monotonic() > deadline:
            print("Panel stayed busy; continuing to deep sleep")
            break
        time.sleep(0.1)


def wifi_rssi():
    try:
        return wifi.radio.ap_info.rssi
    except (AttributeError, RuntimeError):
        return None


def report_status(requests, action, battery, display_updated, wake_seconds):
    try:
        response = requests.post(
            with_token(SERVER + STATUS_PATH),
            data=json.dumps(
                {
                    "battery": battery,
                    "wakeReason": "button:{}".format(action) if action else "timer",
                    "firmware": "eatme-magtag/0.3",
                    "rssi": wifi_rssi(),
                    "displayUpdated": display_updated,
                    "wakeSeconds": wake_seconds,
                }
            ),
            headers={"Content-Type": "application/json"},
            timeout=REQUEST_TIMEOUT,
        )
        status = response.status_code
        response.close()
        if status < 200 or status >= 300:
            raise RuntimeError("status endpoint returned HTTP {}".format(status))
        if action:
            response = requests.post(
                with_token(SERVER + BUTTON_PATH),
                data=json.dumps({"button": action}),
                headers={"Content-Type": "application/json"},
                timeout=REQUEST_TIMEOUT,
            )
            status = response.status_code
            response.close()
            if status < 200 or status >= 300:
                raise RuntimeError("button endpoint returned HTTP {}".format(status))
    except Exception as error:
        print("Status report failed:", safe_error(error))


def deep_sleep(seconds):
    """Enter deep sleep, degrading rather than failing.

    Reaching deep sleep matters more than any feature that might prevent it:
    an awake ESP32-S2 draws tens of milliamps, so a board that falls through
    to the REPL flattens the LiPo in days instead of lasting months. Button
    wake is therefore best-effort, and an outright sleep failure resets the
    board so the next boot can try again.
    """
    print("Sleeping for", seconds, "seconds")
    try:
        wifi.radio.enabled = False
    except Exception as error:
        print("Could not disable the radio:", safe_error(error))

    time_alarm = alarm.time.TimeAlarm(monotonic_time=time.monotonic() + seconds)
    if BUTTON_WAKE:
        try:
            buttons = [
                alarm.pin.PinAlarm(pin=pin, value=False, pull=True)
                for pin in BUTTON_ACTIONS
            ]
            alarm.exit_and_deep_sleep_until_alarms(time_alarm, *buttons)
        except Exception as error:
            # Any pin that cannot arm a wake alarm costs the button interface,
            # never the sleep itself.
            print("Button wake unavailable:", safe_error(error))
    alarm.exit_and_deep_sleep_until_alarms(time_alarm)


def main():
    started = time.monotonic()
    if alarm.wake_alarm is None:
        # Sleep memory after a cold boot or hard reset is not ours to trust.
        # Clearing the page and its validator together stops a retained ETag
        # from being paired with a page it never described.
        clear_page_cache()

    action = wake_action()
    page = read_last_page() if action == "refresh" else (action or "urgent")
    battery = read_battery_percent()
    success = False

    try:
        connect_wifi()
        pool = socketpool.SocketPool(wifi.radio)
        requests = adafruit_requests.Session(pool, ssl.create_default_context())
        bitmap, palette, etag, display_updated = fetch_dashboard(
            requests, page, battery, allow_not_modified=action != "refresh"
        )
        if display_updated:
            show_bitmap(bitmap, palette)
            write_page_cache(page, etag)
        else:
            print("Dashboard unchanged; keeping the existing e-paper image")
        report_status(
            requests,
            action,
            battery,
            display_updated,
            round(time.monotonic() - started, 2),
        )
        success = True
    except Exception as error:
        print("Wake cycle failed:", safe_error(error))

    sleep_seconds = SLEEP_HOURS * 3600 if success else FAILURE_SLEEP_MINUTES * 60
    try:
        deep_sleep(sleep_seconds)
    except Exception as error:
        # Last resort. Falling off the end of code.py would drop the board into
        # the REPL and leave it awake until the battery is flat; a reset at
        # least retries the whole cycle.
        print("Deep sleep failed; resetting:", safe_error(error))
        time.sleep(2)
        microcontroller.reset()


main()
