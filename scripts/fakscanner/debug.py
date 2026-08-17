#!/usr/bin/env python3
#
# VTK fakscanner: hardware-debug
# ------------------------------
# Losse checks voor de Pi aan de bar, zonder token en zonder de site. Bedoeld om
# eerst het schermpje en de lezer werkend te krijgen; pas daarna zetten we
# `fakscanner.py` erop.
#
#   sudo python3 debug.py lcd      # schermpje: backlight, contrast, twee regels
#   sudo python3 debug.py devices  # welke input-apparaten ziet de Pi
#   sudo python3 debug.py scan     # lees de kaartlezer uit, toon wat hij typt
#   sudo python3 debug.py gpio     # lampje op de GPIO-pin knipperen
#   sudo python3 debug.py all      # scan + schermpje samen (de echte opstelling)
#
# `sudo` is nodig voor /dev/input; wil je dat niet, zet jezelf dan in de groep
# `input` (`sudo usermod -aG input $USER`, daarna opnieuw inloggen).
#
# Afhankelijkheden komen allemaal uit apt, dus geen venv nodig:
#   sudo apt install -y i2c-tools python3-smbus2 python3-evdev
#
# Waarom dit script de lezer via evdev leest en niet via stdin: de lezer is een
# toetsenbord en typt in de console van de Pi, niet in je ssh-sessie. Een script
# dat op `input()` wacht blijft over ssh dus leeg staan terwijl de scan wel
# binnenkomt. Via /dev/input lees je hem overal, en met een `grab` gaan de
# toetsaanslagen ook niet meer naar de console eronder.

import argparse
import sys
import time

# ---------------------------------------------------------------------------
# LCD (16x2 op een PCF8574-backpack, standaard op 0x27)
# ---------------------------------------------------------------------------
#
# De pinnen van de backpack liggen vast: bit 0 = RS, bit 1 = RW, bit 2 = E,
# bit 3 = backlight, bits 4-7 = de datalijnen D4-D7. Daarom kunnen we hier een
# eigen driver van veertig regels zetten in plaats van een module te zoeken; de
# oude opstelling importeerde `drivers`, dat op een verse Pi niet bestaat.

LCD_ADDR_DEFAULT = 0x27
LCD_BUS_DEFAULT = 1

_RS = 0x01
_ENABLE = 0x04
_BACKLIGHT = 0x08


class Lcd:
    def __init__(self, bus=LCD_BUS_DEFAULT, addr=LCD_ADDR_DEFAULT):
        from smbus2 import SMBus  # type: ignore

        self.addr = addr
        self.bus = SMBus(bus)
        self.backlight = _BACKLIGHT
        self._init_4bit()

    # -- laag niveau ------------------------------------------------------

    def _write_byte(self, value):
        self.bus.write_byte(self.addr, value | self.backlight)

    def _pulse(self, value):
        self._write_byte(value | _ENABLE)
        time.sleep(0.0005)
        self._write_byte(value & ~_ENABLE)
        time.sleep(0.0001)

    def _write4(self, value):
        self._write_byte(value)
        self._pulse(value)

    def _command(self, value, mode=0):
        """Een byte gaat in twee helften naar buiten; 4-bit-modus."""
        self._write4(mode | (value & 0xF0))
        self._write4(mode | ((value << 4) & 0xF0))

    def _init_4bit(self):
        # Opstartdans uit het HD44780-datasheet: drie keer 0x30 om zeker in een
        # bekende toestand te komen, dan pas overschakelen naar 4-bit.
        time.sleep(0.05)
        for wait in (0.0045, 0.0045, 0.00015):
            self._write4(0x30)
            time.sleep(wait)
        self._write4(0x20)
        time.sleep(0.0001)

        self._command(0x28)  # 2 regels, 5x8 tekens
        self._command(0x08)  # display uit
        self._command(0x01)  # wissen
        time.sleep(0.002)
        self._command(0x06)  # cursor schuift naar rechts
        self._command(0x0C)  # display aan, geen cursor, geen knipper
        time.sleep(0.002)

    # -- bruikbaar niveau -------------------------------------------------

    def clear(self):
        self._command(0x01)
        time.sleep(0.002)

    def set_backlight(self, on):
        self.backlight = _BACKLIGHT if on else 0x00
        self._write_byte(0x00)

    def write(self, text, line=1):
        """Zestien tekens per regel; langer kappen we af."""
        self._command(0x80 if line == 1 else 0xC0)
        for char in text[:16].ljust(16):
            self._command(ord(char), _RS)

    def show(self, line1, line2=""):
        self.write(line1, 1)
        self.write(line2, 2)

    def close(self):
        try:
            self.bus.close()
        except Exception:  # noqa: BLE001
            pass


def open_lcd(args, quiet=False):
    """Geeft een Lcd terug, of None met een uitleg waarom niet."""
    try:
        return Lcd(bus=args.bus, addr=args.addr)
    except Exception as exc:  # noqa: BLE001
        if not quiet:
            print(f"Geen LCD op bus {args.bus} adres 0x{args.addr:02x}: {exc}")
            print("Check: `sudo i2cdetect -y 1` moet 27 (of 3f) tonen.")
        return None


def cmd_lcd(args):
    lcd = open_lcd(args)
    if lcd is None:
        return 1

    print(f"LCD gevonden op 0x{args.addr:02x}.")

    print("1/4 backlight uit ...")
    lcd.set_backlight(False)
    time.sleep(1.5)
    print("2/4 backlight aan ...")
    lcd.set_backlight(True)
    time.sleep(0.5)

    # Volle blokken: hiermee stel je de contrastpotmeter af. Zie je niets, draai
    # het schroefje op de backpack tot de blokken net verschijnen.
    print("3/4 contrastpatroon (draai de potmeter tot de blokken zichtbaar zijn) ...")
    lcd.show("\xff" * 16, "\xff" * 16)
    time.sleep(3)

    print("4/4 tekst op beide regels ...")
    lcd.show("VTK fakscanner", "regel 2 van 2")
    time.sleep(2)
    lcd.show("0123456789ABCDEF", "abcdefghijklmnop")
    time.sleep(2)
    lcd.show("    Scan je", " studentenkaart")

    print("Klaar. Staat de standaardtekst er nu op, dan is het schermpje in orde.")
    lcd.close()
    return 0


# ---------------------------------------------------------------------------
# Kaartlezer (SpringCard Prox'n'Roll in toetsenbordmodus)
# ---------------------------------------------------------------------------
#
# De lezer stuurt geen tekst maar toetsaanslagen (scancodes). Wij vertalen ze
# hier zelf met een US-layout; de kaartdata is hex plus een puntkomma, dus de
# tabel hoeft niet volledig te zijn. Komt er een toets voorbij die we niet
# kennen, dan tonen we de scancode, en dan weten we dat de lezer op een andere
# layout staat.

_DIGITS_SHIFTED = {
    "1": "!",
    "2": "@",
    "3": "#",
    "4": "$",
    "5": "%",
    "6": "^",
    "7": "&",
    "8": "*",
    "9": "(",
    "0": ")",
}

_PUNCTUATION = {
    "KEY_MINUS": ("-", "_"),
    "KEY_EQUAL": ("=", "+"),
    "KEY_LEFTBRACE": ("[", "{"),
    "KEY_RIGHTBRACE": ("]", "}"),
    "KEY_SEMICOLON": (";", ":"),
    "KEY_APOSTROPHE": ("'", '"'),
    "KEY_GRAVE": ("`", "~"),
    "KEY_BACKSLASH": ("\\", "|"),
    "KEY_COMMA": (",", "<"),
    "KEY_DOT": (".", ">"),
    "KEY_SLASH": ("/", "?"),
    "KEY_SPACE": (" ", " "),
}

_SHIFT_KEYS = {"KEY_LEFTSHIFT", "KEY_RIGHTSHIFT"}
_ENTER_KEYS = {"KEY_ENTER", "KEY_KPENTER"}


def _key_name(code):
    from evdev import ecodes  # type: ignore

    name = ecodes.KEY.get(code, f"({code})")
    return name[0] if isinstance(name, list) else name


def _to_char(name, shift):
    if name.startswith("KEY_") and len(name) == 5 and name[4].isalpha():
        letter = name[4]
        return letter.upper() if shift else letter.lower()
    if name.startswith("KEY_") and len(name) == 5 and name[4].isdigit():
        digit = name[4]
        return _DIGITS_SHIFTED[digit] if shift else digit
    if name.startswith("KEY_KP") and len(name) == 7 and name[6].isdigit():
        return name[6]
    pair = _PUNCTUATION.get(name)
    if pair:
        return pair[1] if shift else pair[0]
    return None


def find_readers():
    """Alle input-apparaten, met de vermoedelijke lezer eerst."""
    from evdev import InputDevice, list_devices  # type: ignore

    devices = []
    for path in sorted(list_devices()):
        try:
            devices.append(InputDevice(path))
        except PermissionError:
            print(f"Geen toegang tot {path}; draai met sudo.")
    return devices


def looks_like_reader(device):
    name = (device.name or "").lower()
    return "springcard" in name or "prox" in name or "rfid" in name


def cmd_devices(args):
    devices = find_readers()
    if not devices:
        print("Geen input-apparaten zichtbaar. Draai met sudo.")
        return 1
    print("Input-apparaten:")
    for device in devices:
        mark = "  <-- lezer?" if looks_like_reader(device) else ""
        print(f"  {device.path:20} {device.name}{mark}")
    print()
    print("Staat de lezer er niet bij, kijk dan of hij in toetsenbordmodus (HID)")
    print("staat; in pure PC/SC-modus verschijnt hij hier niet.")
    return 0


def pick_device(args):
    from evdev import InputDevice  # type: ignore

    if args.device:
        return InputDevice(args.device)
    for device in find_readers():
        if looks_like_reader(device):
            return device
    return None


def read_scans(device, on_line, grab=True):
    """
    Leest toetsaanslagen tot Ctrl-C en roept `on_line(text, keys)` bij elke Enter.
    `keys` is de ruwe lijst scancodenamen, handig als de vertaling niet klopt.
    """
    from evdev import categorize, ecodes  # type: ignore

    if grab:
        try:
            device.grab()
        except Exception as exc:  # noqa: BLE001
            print(f"Kon het apparaat niet exclusief claimen ({exc}); de scans")
            print("komen mogelijk ook in de console terecht.")

    buffer = []
    raw = []
    shift = False
    try:
        for event in device.read_loop():
            if event.type != ecodes.EV_KEY:
                continue
            key = categorize(event)
            name = _key_name(event.code)

            if name in _SHIFT_KEYS:
                shift = key.keystate in (key.key_down, key.key_hold)
                continue
            if key.keystate != key.key_down:
                continue

            raw.append(name)
            if name in _ENTER_KEYS:
                on_line("".join(buffer), raw)
                buffer, raw = [], []
                continue

            char = _to_char(name, shift)
            if char is None:
                print(f"  onbekende toets: {name}")
                continue
            buffer.append(char)
    except KeyboardInterrupt:
        pass
    finally:
        if grab:
            try:
                device.ungrab()
            except Exception:  # noqa: BLE001
                pass


def cmd_scan(args):
    device = pick_device(args)
    if device is None:
        print("Geen lezer gevonden. Draai `debug.py devices` en geef de juiste")
        print("met --device /dev/input/eventX.")
        return 1

    print(f"Luistert op {device.path} ({device.name}).")
    print("Scan een kaart. Ctrl-C om te stoppen.")
    print()

    started = time.time()
    count = [0]

    def on_line(text, keys):
        count[0] += 1
        elapsed = time.time() - started
        print(f"[{elapsed:7.2f}s] scan {count[0]}")
        print(f"    tekst : {text!r}")
        print(f"    lengte: {len(text)}")
        if ";" in text:
            serial, _, app = text.partition(";")
            print(f"    serial: {serial!r}")
            print(f"    appId : {app!r}")
        else:
            print("    LET OP: geen puntkomma; de site verwacht 'serial;cardAppId'.")
        print(f"    toetsen: {' '.join(keys)}")
        print()

    read_scans(device, on_line)
    print(f"\nGestopt na {count[0]} scan(s).")
    return 0


def cmd_all(args):
    device = pick_device(args)
    if device is None:
        print("Geen lezer gevonden; draai eerst `debug.py devices`.")
        return 1
    lcd = open_lcd(args)
    if lcd is not None:
        lcd.show("    Scan je", " studentenkaart")

    print(f"Luistert op {device.path} ({device.name}); scans gaan ook naar het")
    print("schermpje. Ctrl-C om te stoppen.")

    def on_line(text, keys):
        print(f"scan: {text!r}")
        if lcd is None:
            return
        serial = text.partition(";")[0]
        lcd.show("Gelezen:", serial[:16])
        time.sleep(2)
        lcd.show("    Scan je", " studentenkaart")

    read_scans(device, on_line)
    if lcd is not None:
        lcd.clear()
        lcd.close()
    return 0


# ---------------------------------------------------------------------------
# GPIO-lampje
# ---------------------------------------------------------------------------


def cmd_gpio(args):
    try:
        import RPi.GPIO as GPIO  # type: ignore
    except Exception as exc:  # noqa: BLE001
        print(f"RPi.GPIO niet beschikbaar ({exc}).")
        print("Op Debian trixie installeer je de vervanger:")
        print("  sudo apt install -y python3-rpi-lgpio")
        return 1

    print(f"Knippert BCM-pin {args.pin}, vijf keer. Ctrl-C om te stoppen.")
    GPIO.setwarnings(False)
    GPIO.setmode(GPIO.BCM)
    GPIO.setup(args.pin, GPIO.OUT)
    try:
        for _ in range(5):
            GPIO.output(args.pin, 1)
            time.sleep(0.5)
            GPIO.output(args.pin, 0)
            time.sleep(0.5)
    except KeyboardInterrupt:
        pass
    finally:
        GPIO.output(args.pin, 0)
        GPIO.cleanup()
    return 0


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(description="VTK fakscanner: hardware-debug")
    parser.add_argument("--bus", type=int, default=LCD_BUS_DEFAULT, help="I2C-bus (standaard 1)")
    parser.add_argument(
        "--addr",
        type=lambda v: int(v, 0),
        default=LCD_ADDR_DEFAULT,
        help="I2C-adres van het schermpje (standaard 0x27)",
    )
    parser.add_argument("--device", help="pad naar de lezer, bv. /dev/input/event0")
    parser.add_argument("--pin", type=int, default=26, help="BCM-pin van het lampje (standaard 26)")
    parser.add_argument(
        "command",
        nargs="?",
        default="all",
        choices=["lcd", "devices", "scan", "gpio", "all"],
        help="wat je wil testen (standaard: all)",
    )
    args = parser.parse_args()

    commands = {
        "lcd": cmd_lcd,
        "devices": cmd_devices,
        "scan": cmd_scan,
        "gpio": cmd_gpio,
        "all": cmd_all,
    }
    return commands[args.command](args)


if __name__ == "__main__":
    sys.exit(main())
