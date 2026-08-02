# Runs before code.py, once, on every boot (including waking from deep sleep).
#
# code.py writes the fetched dashboard BMP to flash, so the filesystem needs
# to be writable from the running program. That's the opposite of the default
# (writable from a USB-attached computer, read-only from code) — remount it,
# except when button A is held during boot, so you can still plug the MagTag
# into a computer and edit code.py normally.
import board
import digitalio
import storage

switch = digitalio.DigitalInOut(board.BUTTON_A)
switch.switch_to_input(pull=digitalio.Pull.UP)

storage.remount("/", readonly=switch.value)
switch.deinit()
