#!/usr/bin/env python3
#
# VTK fakscanner: hardware-debug
# ------------------------------
# Losse checks voor de Pi aan de bar, zonder token en zonder de site. Bedoeld om
# eerst het schermpje, de lezer en de LED werkend te krijgen; pas daarna zetten
# we `fakscanner.py` erop.
#
#   sudo python3 debug.py lcd      # schermpje: backlight, contrast, twee regels
#   sudo python3 debug.py devices  # welke input-apparaten ziet de Pi
#   sudo python3 debug.py scan     # lees de kaartlezer uit, toon wat hij typt
#   sudo python3 debug.py gpio     # lampje op de GPIO-pin knipperen
#   sudo python3 debug.py pcsc     # staat de lezer in PC/SC-modus (nodig voor de LED)
#   sudo python3 debug.py led      # LED van de lezer van kleur doen veranderen
#   sudo python3 debug.py all      # scan + schermpje samen (de echte opstelling)
#
# `sudo` is nodig voor /dev/input; wil je dat niet, zet jezelf dan in de groep
# `input` (`sudo usermod -aG input $USER`, daarna opnieuw inloggen).
#
# Afhankelijkheden komen allemaal uit apt, dus geen venv nodig:
#   sudo apt install -y i2c-tools python3-smbus2 python3-evdev
#   sudo apt install -y pcscd pcsc-tools python3-pyscard   # enkel voor de LED
#
# Waarom dit script de lezer via evdev leest en niet via stdin: de lezer is een
# toetsenbord en typt in de console van de Pi, niet in je ssh-sessie. Een script
# dat op `input()` wacht blijft over ssh dus leeg staan terwijl de scan wel
# binnenkomt. Via /dev/input lees je hem overal, en met een `grab` gaan de
# toetsaanslagen ook niet meer naar de console eronder.

import argparse
import os
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
#
# LET OP het jumpertje op de backpack (twee pinnen naast de contrastschroef).
# Ontbreekt het, dan hangt de achtergrondverlichting los en blijft het scherm
# dood, terwijl `i2cdetect` de chip gewoon toont en elk commando ge-ACK't wordt.
# Niets in software kan je dat vertellen. Dat heeft hier een avond gekost.

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
    print("    Geen verschil gezien? Dan ontbreekt het jumpertje op de backpack.")

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
# De lezer stuurt geen tekst maar toetsaanslagen (scancodes), en gaat er daarbij
# van uit dat de computer op een bepaalde toetsenbordindeling staat. De onze is
# op **Belgisch AZERTY** geconfigureerd: cijfers komen binnen als shift + de
# cijfertoets, `KEY_Q` is een `a`, en de puntkomma tussen serial en cardAppId is
# `KEY_COMMA` zonder shift.
#
# Het oude Litus-script merkte daar niets van omdat het `stdin` las: de kernel
# deed de vertaling met de console-keymap van de Pi, die Belgisch stond. Wij
# lezen /dev/input rechtstreeks en doen de vertaling dus zelf. Dat is bewust: het
# hangt zo niet af van een systeeminstelling die een herinstallatie stil reset.
#
# Staat de lezer ooit toch op US, dan is `--layout us` genoeg.

# Per scancode: (zonder shift, met shift).
LAYOUT_BE = {
    "KEY_GRAVE": ("²", "³"),
    "KEY_1": ("&", "1"),
    "KEY_2": ("é", "2"),
    "KEY_3": ('"', "3"),
    "KEY_4": ("'", "4"),
    "KEY_5": ("(", "5"),
    "KEY_6": ("§", "6"),
    "KEY_7": ("è", "7"),
    "KEY_8": ("!", "8"),
    "KEY_9": ("ç", "9"),
    "KEY_0": ("à", "0"),
    "KEY_MINUS": (")", "°"),
    "KEY_EQUAL": ("-", "_"),
    "KEY_Q": ("a", "A"),
    "KEY_W": ("z", "Z"),
    "KEY_E": ("e", "E"),
    "KEY_R": ("r", "R"),
    "KEY_T": ("t", "T"),
    "KEY_Y": ("y", "Y"),
    "KEY_U": ("u", "U"),
    "KEY_I": ("i", "I"),
    "KEY_O": ("o", "O"),
    "KEY_P": ("p", "P"),
    "KEY_LEFTBRACE": ("^", "¨"),
    "KEY_RIGHTBRACE": ("$", "*"),
    "KEY_A": ("q", "Q"),
    "KEY_S": ("s", "S"),
    "KEY_D": ("d", "D"),
    "KEY_F": ("f", "F"),
    "KEY_G": ("g", "G"),
    "KEY_H": ("h", "H"),
    "KEY_J": ("j", "J"),
    "KEY_K": ("k", "K"),
    "KEY_L": ("l", "L"),
    "KEY_SEMICOLON": ("m", "M"),
    "KEY_APOSTROPHE": ("ù", "%"),
    "KEY_BACKSLASH": ("µ", "£"),
    "KEY_102ND": ("<", ">"),
    "KEY_Z": ("w", "W"),
    "KEY_X": ("x", "X"),
    "KEY_C": ("c", "C"),
    "KEY_V": ("v", "V"),
    "KEY_B": ("b", "B"),
    "KEY_N": ("n", "N"),
    "KEY_M": (",", "?"),
    "KEY_COMMA": (";", "."),
    "KEY_DOT": (":", "/"),
    "KEY_SLASH": ("=", "+"),
    "KEY_SPACE": (" ", " "),
}

LAYOUT_US = {
    "KEY_GRAVE": ("`", "~"),
    "KEY_1": ("1", "!"),
    "KEY_2": ("2", "@"),
    "KEY_3": ("3", "#"),
    "KEY_4": ("4", "$"),
    "KEY_5": ("5", "%"),
    "KEY_6": ("6", "^"),
    "KEY_7": ("7", "&"),
    "KEY_8": ("8", "*"),
    "KEY_9": ("9", "("),
    "KEY_0": ("0", ")"),
    "KEY_MINUS": ("-", "_"),
    "KEY_EQUAL": ("=", "+"),
    "KEY_LEFTBRACE": ("[", "{"),
    "KEY_RIGHTBRACE": ("]", "}"),
    "KEY_SEMICOLON": (";", ":"),
    "KEY_APOSTROPHE": ("'", '"'),
    "KEY_BACKSLASH": ("\\", "|"),
    "KEY_102ND": ("\\", "|"),
    "KEY_COMMA": (",", "<"),
    "KEY_DOT": (".", ">"),
    "KEY_SLASH": ("/", "?"),
    "KEY_SPACE": (" ", " "),
}
# De letters liggen op US op hun eigen scancode, dus die vullen we aan.
for _letter in "abcdefghijklmnopqrstuvwxyz":
    LAYOUT_US.setdefault(f"KEY_{_letter.upper()}", (_letter, _letter.upper()))

LAYOUTS = {"be": LAYOUT_BE, "us": LAYOUT_US}

_SHIFT_KEYS = {"KEY_LEFTSHIFT", "KEY_RIGHTSHIFT"}
_ENTER_KEYS = {"KEY_ENTER", "KEY_KPENTER"}


def _key_name(code):
    from evdev import ecodes  # type: ignore

    name = ecodes.KEY.get(code, f"({code})")
    return name[0] if isinstance(name, list) else name


def decode(events, layout):
    """
    Zet [(scancode, shift-ingedrukt)] om naar tekst met de gekozen indeling.
    Onbekende toetsen worden `?`, zodat de lengte blijft kloppen.
    """
    table = LAYOUTS[layout]
    out = []
    for name, shift in events:
        # Het numerieke klavier staat los van de indeling.
        if name.startswith("KEY_KP") and len(name) == 7 and name[6].isdigit():
            out.append(name[6])
            continue
        pair = table.get(name)
        out.append((pair[1] if shift else pair[0]) if pair else "?")
    return "".join(out)


def trace(events):
    """Leesbare weergave van de ruwe toetsen; `S+` betekent met shift."""
    return " ".join(f"S+{name}" if shift else name for name, shift in events)


def find_devices():
    """Alle input-apparaten die we mogen openen."""
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
    devices = find_devices()
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
    for device in find_devices():
        if looks_like_reader(device):
            return device
    return None


def read_scans(device, on_line, grab=True):
    """
    Leest toetsaanslagen tot Ctrl-C en roept `on_line(events)` bij elke Enter,
    met `events` als lijst van (scancode, shift-ingedrukt).
    """
    from evdev import categorize, ecodes  # type: ignore

    if grab:
        try:
            device.grab()
        except Exception as exc:  # noqa: BLE001
            print(f"Kon het apparaat niet exclusief claimen ({exc}); de scans")
            print("komen mogelijk ook in de console terecht.")

    events = []
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
            if name in _ENTER_KEYS:
                on_line(events)
                events = []
                continue

            events.append((name, shift))
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

    print(f"Luistert op {device.path} ({device.name}), indeling: {args.layout}.")
    print("Scan een kaart. Ctrl-C om te stoppen.")
    print()

    started = time.time()
    count = [0]

    def on_line(events):
        count[0] += 1
        text = decode(events, args.layout)
        print(f"[{time.time() - started:7.2f}s] scan {count[0]}")
        print(f"    tekst ({args.layout}): {text!r}")
        # De andere indeling erbij, zodat meteen zichtbaar is of we de verkeerde
        # gekozen hebben: eentje geeft leesbare hex met een puntkomma, de andere
        # leestekensoep.
        for other in LAYOUTS:
            if other != args.layout:
                print(f"    tekst ({other}): {decode(events, other)!r}")
        print(f"    lengte: {len(text)}")
        if ";" in text:
            serial, _, app = text.partition(";")
            print(f"    serial: {serial!r}")
            print(f"    appId : {app!r}")
        else:
            print("    LET OP: geen puntkomma; de site verwacht 'serial;cardAppId'.")
        print(f"    toetsen: {trace(events)}")
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

    def on_line(events):
        text = decode(events, args.layout)
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
# LED in de lezer (PC/SC vendor escape)
# ---------------------------------------------------------------------------
#
# De Prox'n'Roll heeft een meerkleurige LED die je met een escape-commando via
# PC/SC aanstuurt. Twee dingen moeten daarvoor kloppen, en geen van beide is
# software die wij schrijven:
#
#   1. De lezer moet een PC/SC-interface aanbieden. In pure toetsenbordmodus
#      (HID) doet hij dat niet: pcscd ziet dan niets en er valt niets aan te
#      sturen. Met de SpringCard-configuratietool zet je hem in de gecombineerde
#      modus (keyboard + PC/SC).
#   2. Escape-commando's staan standaard uit in de CCID-driver. Zet in
#      /etc/libccid_Info.plist de sleutel `ifdDriverOptions` op `0x0001` en
#      herstart pcscd (`sudo systemctl restart pcscd`).
#
# `debug.py pcsc` controleert allebei. De escape-bytes zelf verschillen per
# firmware; werkt de standaard niet, probeer dan een andere met --escape.

# Bitmasker per kleur: bit 0 = rood, bit 1 = groen, bit 2 = blauw.
LED_COLORS = {
    "uit": 0b000,
    "rood": 0b001,
    "groen": 0b010,
    "geel": 0b011,
    "blauw": 0b100,
    "paars": 0b101,
    "cyaan": 0b110,
    "wit": 0b111,
}

CCID_CONFIG = "/etc/libccid_Info.plist"


def cmd_pcsc(args):
    """Kijkt na of de LED-aansturing überhaupt kan werken."""
    ok = True

    try:
        from smartcard.System import readers  # type: ignore
    except Exception as exc:  # noqa: BLE001
        print(f"pyscard ontbreekt ({exc}).")
        print("  sudo apt install -y pcscd pcsc-tools python3-pyscard")
        return 1

    try:
        available = readers()
    except Exception as exc:  # noqa: BLE001
        print(f"Kon PC/SC niet bevragen ({exc}). Draait pcscd?")
        print("  sudo systemctl enable --now pcscd")
        return 1

    if available:
        print("PC/SC-lezers:")
        for reader in available:
            print(f"  {reader}")
    else:
        ok = False
        print("Geen PC/SC-lezer gevonden.")
        print("  Draait pcscd?  sudo systemctl status pcscd")
        print("  De lezer staat waarschijnlijk in toetsenbordmodus (HID). Hij")
        print("  verschijnt dan wel onder /dev/input maar niet in PC/SC, en dan")
        print("  is de LED niet aanstuurbaar. Zet hem met de SpringCard-tool in")
        print("  de gecombineerde modus (keyboard + PC/SC).")

    print()
    if os.path.exists(CCID_CONFIG):
        try:
            with open(CCID_CONFIG, encoding="utf-8", errors="replace") as handle:
                config = handle.read()
        except Exception as exc:  # noqa: BLE001
            config = ""
            print(f"Kon {CCID_CONFIG} niet lezen ({exc}).")
        if "ifdDriverOptions" in config:
            index = config.index("ifdDriverOptions")
            fragment = " ".join(config[index : index + 200].split())
            print(f"CCID-driveropties: {fragment[:120]}")
            print("  Escape-commando's werken pas met 0x0001 in dat veld.")
        else:
            print(f"Geen ifdDriverOptions in {CCID_CONFIG}.")
    else:
        print(f"{CCID_CONFIG} bestaat niet; is de CCID-driver geïnstalleerd?")
        print("  sudo apt install -y libccid")

    return 0 if ok else 1


def _led_connection():
    """Directe PC/SC-verbinding met de lezer, ook zonder kaart erop."""
    from smartcard.scard import SCARD_LEAVE_CARD, SCARD_SHARE_DIRECT  # type: ignore
    from smartcard.System import readers  # type: ignore

    available = readers()
    if not available:
        raise RuntimeError(
            "geen PC/SC-lezer gevonden; draai `debug.py pcsc` voor de reden"
        )
    connection = available[0].createConnection()
    connection.connect(mode=SCARD_SHARE_DIRECT, disposition=SCARD_LEAVE_CARD)
    return connection


def _control_code(args):
    if args.control_code:
        return args.control_code
    from smartcard.scard import SCARD_CTL_CODE  # type: ignore

    # 1 is de escape-code van pcsc-lite (Linux); Windows gebruikt 2048/3500.
    return SCARD_CTL_CODE(1)


def _send_led(connection, code, escape, mask):
    command = list(bytes.fromhex(escape)) + [mask]
    response = connection.control(code, command)
    return response


def cmd_led(args):
    try:
        connection = _led_connection()
    except Exception as exc:  # noqa: BLE001
        print(f"Geen verbinding met de lezer: {exc}")
        return 1

    code = _control_code(args)
    print(f"Escape {args.escape}, control code {code}.")

    try:
        if args.sweep:
            # Alle kleuren na elkaar; zo zie je meteen welke maskers je lezer
            # aankan en hoe ze er in het echt uitzien.
            print("Alle kleuren, twee seconden elk. Ctrl-C om te stoppen.")
            for name, mask in LED_COLORS.items():
                if name == "uit":
                    continue
                print(f"  {name} (masker {mask:03b}) ...")
                try:
                    _send_led(connection, code, args.escape, mask)
                except Exception as exc:  # noqa: BLE001
                    print(f"    mislukt: {exc}")
                time.sleep(2)
            _send_led(connection, code, args.escape, LED_COLORS["uit"])
            print("Klaar. Zag je niets veranderen, dan kloppen de escape-bytes")
            print("niet voor deze firmware; probeer een andere met --escape.")
            return 0

        mask = LED_COLORS.get(args.color)
        if mask is None:
            print(f"Onbekende kleur '{args.color}'; kies uit {', '.join(LED_COLORS)}.")
            return 1
        print(f"{args.color} (masker {mask:03b}) voor {args.seconds}s ...")
        _send_led(connection, code, args.escape, mask)
        if args.seconds > 0:
            time.sleep(args.seconds)
            _send_led(connection, code, args.escape, LED_COLORS["uit"])
        return 0
    except KeyboardInterrupt:
        try:
            _send_led(connection, code, args.escape, LED_COLORS["uit"])
        except Exception:  # noqa: BLE001
            pass
        return 0
    except Exception as exc:  # noqa: BLE001
        print(f"LED aansturen mislukt: {exc}")
        print("Draai `debug.py pcsc`; meestal staan de escape-commando's uit in")
        print("de CCID-driver of staat de lezer niet in PC/SC-modus.")
        return 1
    finally:
        try:
            connection.disconnect()
        except Exception:  # noqa: BLE001
            pass


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
    parser.add_argument("--device", help="pad naar de lezer, bv. /dev/input/event4")
    parser.add_argument(
        "--layout",
        default="be",
        choices=sorted(LAYOUTS),
        help="toetsenbordindeling waarop de lezer staat (standaard be)",
    )
    parser.add_argument("--pin", type=int, default=26, help="BCM-pin van het lampje (standaard 26)")
    parser.add_argument("--color", default="paars", help=f"LED-kleur: {', '.join(LED_COLORS)}")
    parser.add_argument("--sweep", action="store_true", help="alle LED-kleuren na elkaar tonen")
    parser.add_argument("--seconds", type=float, default=3.0, help="hoelang de LED aan blijft")
    parser.add_argument("--escape", default="581E", help="escape-bytes van de LED (hex)")
    parser.add_argument(
        "--control-code",
        type=lambda v: int(v, 0),
        default=0,
        help="PC/SC control code; standaard die van pcsc-lite",
    )
    parser.add_argument(
        "command",
        nargs="?",
        default="all",
        choices=["lcd", "devices", "scan", "gpio", "pcsc", "led", "all"],
        help="wat je wil testen (standaard: all)",
    )
    args = parser.parse_args()

    commands = {
        "lcd": cmd_lcd,
        "devices": cmd_devices,
        "scan": cmd_scan,
        "gpio": cmd_gpio,
        "pcsc": cmd_pcsc,
        "led": cmd_led,
        "all": cmd_all,
    }
    return commands[args.command](args)


if __name__ == "__main__":
    sys.exit(main())
