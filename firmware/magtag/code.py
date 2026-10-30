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
import neopixel_write
import socketpool
import ssl
import terminalio
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
    # settings.toml only holds strings and integers; a bare TOML true/false is
    # not a supported value. Fall back rather than stop before deep sleep.
    try:
        value = os.getenv(name, default)
    except ValueError:
        print(name, "is invalid; using", default)
        value = default
    if isinstance(value, bool):
        return value
    return str(value).lower() in ("1", "true", "yes", "on")


BUTTON_WAKE = _setting_enabled("EATME_BUTTON_WAKE", "true")
# A button press first draws a short "Loading" screen, so the panel answers
# within about two seconds instead of after Wi-Fi and the download. It costs
# one extra e-paper refresh per press, never on a scheduled wake.
LOADING_SCREEN = _setting_enabled("EATME_LOADING_SCREEN", "true")

DASHBOARD_PATH = "/api/magtag/display.bmp"
PAGE_PATH = "/api/magtag/page/{page}"
STATUS_PATH = "/api/magtag/status"
BUTTON_PATH = "/api/magtag/button"

BUTTON_ACTIONS = {
    board.BUTTON_A: "urgent",
    board.BUTTON_B: "recipe",
    board.BUTTON_C: "shopping",
    board.BUTTON_D: "status",
}
PAGE_TITLES = {
    "urgent": "Use soon",
    "recipe": "Recipe",
    "shopping": "Shopping",
    "status": "Status",
}
PAGE_IDS = {"urgent": 0, "recipe": 1, "shopping": 2, "status": 3}
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
        return output
    except ValueError:
        return None


_hold_output("SPEAKER_ENABLE", False)
_pixel_power = _hold_output("NEOPIXEL_POWER", True)

# The four NeoPixels sit along the top edge, one above each button. A press
# lights its own pixel at once, because Wi-Fi, the download and the e-paper
# refresh take several seconds before the panel changes. Pixel 0 is assumed to
# be the rightmost (above D); swap this mapping if the wrong pixel lights.
PIXEL_FOR_PAGE = {"urgent": 3, "recipe": 2, "shopping": 1, "status": 0}
PIXEL_COUNT = 4
PRESS_COLOR = (0, 0, 24)  # dim blue (R, G, B)
FAILURE_COLOR = (24, 0, 0)  # dim red
FAILURE_FLASH_SECONDS = 1.5
_pixel_pin = None


def show_pixel(index, color):
    """Light one pixel (or none for index None); best-effort, never fatal."""
    global _pixel_pin
    if not hasattr(board, "NEOPIXEL"):
        return
    try:
        if _pixel_pin is None:
            _pixel_pin = digitalio.DigitalInOut(board.NEOPIXEL)
            _pixel_pin.direction = digitalio.Direction.OUTPUT
        buffer = bytearray(PIXEL_COUNT * 3)
        if index is not None:
            red, green, blue = color
            buffer[index * 3 : index * 3 + 3] = bytes((green, red, blue))
        # The rail is active low: False powers the pixels, True turns them off.
        if _pixel_power is not None:
            _pixel_power.value = index is None
        neopixel_write.neopixel_write(_pixel_pin, buffer)
    except Exception as error:
        print("NeoPixel feedback unavailable:", error)


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


def request_headers(extra=None):
    """Send the device token in a header, never in the URL.

    A URL can appear in a reverse proxy's access log; this header does not.
    """
    headers = {"X-EatMe-Device-Token": TOKEN} if TOKEN else {}
    if extra:
        headers.update(extra)
    return headers


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
    url = SERVER + path
    if battery is not None:
        url = add_query(url, "battery", battery)

    cached_etag = read_cached_etag(page) if allow_not_modified else None
    response = requests.get(
        url,
        headers=request_headers(
            {"If-None-Match": cached_etag} if cached_etag else None
        ),
        timeout=REQUEST_TIMEOUT,
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


def wait_for_refresh_slot(display):
    # The panel refuses a new refresh until its minimum interval has passed;
    # wait that out rather than spend the retries on it.
    wait = getattr(display, "time_to_refresh", 0)
    if 0 < wait <= PANEL_BUSY_TIMEOUT:
        time.sleep(wait)


def wait_while_busy(display):
    # Bounded: a panel whose busy line never clears must not hold the board
    # awake, because skipping deep sleep costs orders of magnitude more energy
    # than a partially refreshed image does.
    deadline = time.monotonic() + PANEL_BUSY_TIMEOUT
    while getattr(display, "busy", False):
        if time.monotonic() > deadline:
            print("Panel stayed busy; continuing to deep sleep")
            break
        time.sleep(0.1)


def show_message(title, note, finish=False):
    """Draw a two-line text screen for button feedback.

    Without finish, the refresh only starts: Wi-Fi and the download run while
    the panel is still busy, and show_bitmap honours the refresh interval.
    """
    try:
        from adafruit_display_text import label
    except ImportError:
        print("adafruit_display_text missing; no message screen")
        return
    try:
        display = board.DISPLAY
        display.rotation = 270
        palette = displayio.Palette(1)
        palette[0] = 0xFFFFFF
        group = displayio.Group()
        group.append(
            displayio.TileGrid(
                displayio.Bitmap(display.width, display.height, 1),
                pixel_shader=palette,
            )
        )
        title = label.Label(terminalio.FONT, text=title, color=0x000000, scale=3)
        title.anchor_point = (0.5, 0.5)
        title.anchored_position = (display.width // 2, display.height // 2 - 14)
        group.append(title)
        note = label.Label(terminalio.FONT, text=note, color=0x000000, scale=2)
        note.anchor_point = (0.5, 0.5)
        note.anchored_position = (display.width // 2, display.height // 2 + 26)
        group.append(note)
        display.root_group = group
        if finish:
            wait_for_refresh_slot(display)
        display.refresh()
        if finish:
            wait_while_busy(display)
    except Exception as error:
        # Feedback is optional; it must never stop the wake from sleeping.
        print("Message screen failed:", safe_error(error))


def show_bitmap(bitmap, palette):
    display = board.DISPLAY
    display.rotation = 270
    group = displayio.Group()
    group.append(displayio.TileGrid(bitmap, pixel_shader=palette))
    display.root_group = group

    wait_for_refresh_slot(display)
    for attempt in range(3):
        try:
            display.refresh()
            break
        except RuntimeError:
            if attempt == 2:
                raise
            time.sleep(2)
    wait_while_busy(display)


def wifi_rssi():
    try:
        return wifi.radio.ap_info.rssi
    except (AttributeError, RuntimeError):
        return None


def report_status(requests, action, battery, display_updated, wake_seconds):
    try:
        response = requests.post(
            SERVER + STATUS_PATH,
            data=json.dumps(
                {
                    "battery": battery,
                    "wakeReason": "button:{}".format(action) if action else "timer",
                    "firmware": "eatme-magtag/0.5",
                    "rssi": wifi_rssi(),
                    "displayUpdated": display_updated,
                    "wakeSeconds": wake_seconds,
                }
            ),
            headers=request_headers({"Content-Type": "application/json"}),
            timeout=REQUEST_TIMEOUT,
        )
        status = response.status_code
        response.close()
        if status < 200 or status >= 300:
            raise RuntimeError("status endpoint returned HTTP {}".format(status))
        if action:
            response = requests.post(
                SERVER + BUTTON_PATH,
                data=json.dumps({"button": action}),
                headers=request_headers({"Content-Type": "application/json"}),
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
    # A timer wake always checks the default urgent page. A button wake shows
    # its own page (A-D map to a distinct page each — see BUTTON_ACTIONS) and
    # always redraws it: allow_not_modified is False for every button press,
    # so the ETag cache is only ever used to skip a scheduled, unattended
    # refresh, never one the user just asked for by pressing something.
    page = action or "urgent"
    if action:
        show_pixel(PIXEL_FOR_PAGE.get(page), PRESS_COLOR)
        if LOADING_SCREEN:
            show_message(PAGE_TITLES.get(page, page), "Loading...")
    battery = read_battery_percent()
    success = False

    try:
        connect_wifi()
        pool = socketpool.SocketPool(wifi.radio)
        requests = adafruit_requests.Session(pool, ssl.create_default_context())
        bitmap, palette, etag, display_updated = fetch_dashboard(
            requests, page, battery, allow_not_modified=action is None
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
        if action:
            # Tell the person standing at the panel that the press did not work.
            show_pixel(PIXEL_FOR_PAGE.get(page), FAILURE_COLOR)
            if LOADING_SCREEN:
                # Never leave "Loading..." on the panel until the next wake.
                show_message("Not loaded", "Press again later", finish=True)
            else:
                time.sleep(FAILURE_FLASH_SECONDS)

    show_pixel(None, None)

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
