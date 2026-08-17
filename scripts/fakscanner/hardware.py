#!/usr/bin/env python3
#
# VTK fakscanner: de twee stukken hardware aan de bar
# ---------------------------------------------------

import time

# ---------------------------------------------------------------------------
# Schermpje
# ---------------------------------------------------------------------------
_RS = 0x01
_ENABLE = 0x04
_BACKLIGHT = 0x08


class Screen:
    """Het schermpje aan de bar: twee regels van zestien tekens."""

    def __init__(self, bus=1, addr=0x27):
        from smbus2 import SMBus  # type: ignore

        self.addr = addr
        self._bus = SMBus(bus)
        self._backlight = _BACKLIGHT
        self._setup()

    # -- naar buiten ------------------------------------------------------

    def show(self, line1, line2=""):
        """Zet twee regels neer; langer dan zestien tekens wordt afgekapt."""
        self._line(line1, 0x80)
        self._line(line2, 0xC0)

    def clear(self):
        self._command(0x01)
        time.sleep(0.002)

    def backlight(self, on=True):
        self._backlight = _BACKLIGHT if on else 0x00
        self._byte(0x00)

    def close(self):
        try:
            self._bus.close()
        except Exception:  # noqa: BLE001
            pass

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()

    # -- naar binnen ------------------------------------------------------

    def _byte(self, value):
        self._bus.write_byte(self.addr, value | self._backlight)

    def _nibble(self, value):
        self._byte(value)
        self._byte(value | _ENABLE)
        time.sleep(0.0005)
        self._byte(value & ~_ENABLE)
        time.sleep(0.0001)

    def _command(self, value, mode=0):
        """Een byte gaat in twee helften naar buiten; 4-bit-modus."""
        self._nibble(mode | (value & 0xF0))
        self._nibble(mode | ((value << 4) & 0xF0))

    def _line(self, text, address):
        self._command(address)
        for char in str(text)[:16].ljust(16):
            self._command(ord(char), _RS)

    def _setup(self):
        # Opstartdans uit het HD44780-datasheet: drie keer 0x30 om in een bekende
        # toestand te komen, dan pas overschakelen naar 4-bit.
        time.sleep(0.05)
        for wait in (0.0045, 0.0045, 0.00015):
            self._nibble(0x30)
            time.sleep(wait)
        self._nibble(0x20)
        time.sleep(0.0001)

        for command in (0x28, 0x08, 0x01, 0x06, 0x0C):
            self._command(command)
            time.sleep(0.002)


# ---------------------------------------------------------------------------
# Kaartlezer
# ---------------------------------------------------------------------------
#
# De SpringCard is een toetsenbord: hij "typt" `serial;cardAppId` plus Enter. We
# lezen hem via /dev/input en niet via stdin, om twee redenen. Ten eerste typt hij
# in de console van de Pi en niet in je ssh-sessie, dus een `input()`-lus blijft
# over ssh leeg staan. Ten tweede kunnen we het apparaat zo exclusief claimen
# (`grab`), waardoor de scans niet meer in de console eronder terechtkomen.
#
# Prijs daarvan: de kernel vertaalt de scancodes niet meer voor ons, dus doen we
# dat hier. De lezer staat op **Belgisch AZERTY**; cijfers komen binnen als
# shift + cijfertoets, `KEY_Q` is een `a`, en de puntkomma tussen de twee velden
# is `KEY_COMMA` zonder shift. Het oude Litus-script merkte daar niets van omdat
# de console-keymap van de Pi toen Belgisch stond; dat is precies het soort
# systeeminstelling dat een herinstallatie stil terugzet, dus doen we het zelf.

# Cijferrij zonder shift (KEY_1 tot en met KEY_0); met shift zijn het de cijfers.
_BE_DIGITS = "&é\"'(§è!çà"

# Letters die op AZERTY ergens anders liggen dan op QWERTY; de rest valt samen.
_BE_LETTERS = {"KEY_Q": "a", "KEY_W": "z", "KEY_A": "q", "KEY_Z": "w"}

# Leestekens die we kunnen tegenkomen: (zonder shift, met shift).
_BE_PUNCTUATION = {
    "KEY_M": (",", "?"),
    "KEY_COMMA": (";", "."),
    "KEY_DOT": (":", "/"),
    "KEY_SLASH": ("=", "+"),
    "KEY_MINUS": (")", "°"),
    "KEY_EQUAL": ("-", "_"),
    "KEY_SPACE": (" ", " "),
}

_SHIFT_KEYS = ("KEY_LEFTSHIFT", "KEY_RIGHTSHIFT")
_ENTER_KEYS = ("KEY_ENTER", "KEY_KPENTER")


def to_char(key, shift):
    """Eén scancode naar het teken dat een Belgisch toetsenbord zou geven."""
    if key in _BE_PUNCTUATION:
        return _BE_PUNCTUATION[key][1 if shift else 0]
    if key.startswith("KEY_KP") and key[6:].isdigit():
        return key[6:]
    rest = key[4:]
    if len(rest) == 1 and rest.isalpha():
        letter = _BE_LETTERS.get(key, rest.lower())
        return letter.upper() if shift else letter
    if len(rest) == 1 and rest.isdigit():
        # KEY_1 tot KEY_9 staan op index 0 tot 8, KEY_0 achteraan.
        index = (int(rest) - 1) % 10
        return rest if shift else _BE_DIGITS[index]
    return ""


class Scanner:
    """
    De kaartlezer. Itereer erover en je krijgt per scan de ruwe string die de
    site verwacht (`serial;cardAppId`):

        for card in Scanner():
            ...

    `read()` geeft er één en wacht tot dat lukt.
    """

    def __init__(self, path=None, grab=True):
        from evdev import InputDevice  # type: ignore

        self.device = InputDevice(path) if path else self._find()
        self._grab = grab
        self._grabbed = False

    @staticmethod
    def _find():
        from evdev import InputDevice, list_devices  # type: ignore

        for path in sorted(list_devices()):
            device = InputDevice(path)
            name = (device.name or "").lower()
            if "springcard" in name or "prox" in name or "rfid" in name:
                return device
            device.close()
        raise RuntimeError(
            "geen kaartlezer gevonden onder /dev/input "
            "(draai met sudo, of geef het pad mee: Scanner('/dev/input/event4'))"
        )

    @property
    def name(self):
        return self.device.name

    def read(self):
        """Wacht op één scan en geeft ze terug."""
        for card in self:
            return card
        return None

    def __iter__(self):
        from evdev import categorize, ecodes  # type: ignore

        self._claim()
        chars = []
        shift = False
        for event in self.device.read_loop():
            if event.type != ecodes.EV_KEY:
                continue
            key = categorize(event)
            name = ecodes.KEY.get(event.code, "")
            if isinstance(name, list):
                name = name[0]

            if name in _SHIFT_KEYS:
                shift = key.keystate in (key.key_down, key.key_hold)
                continue
            if key.keystate != key.key_down:
                continue
            if name in _ENTER_KEYS:
                card = "".join(chars)
                chars = []
                if card:
                    yield card
                continue
            chars.append(to_char(name, shift))

    def close(self):
        if self._grabbed:
            try:
                self.device.ungrab()
            except Exception:  # noqa: BLE001
                pass
            self._grabbed = False
        try:
            self.device.close()
        except Exception:  # noqa: BLE001
            pass

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()

    def _claim(self):
        """Exclusief claimen, zodat de scans niet in de console terechtkomen."""
        if self._grab and not self._grabbed:
            self.device.grab()
            self._grabbed = True


# ---------------------------------------------------------------------------
# Kleine demo: `sudo python3 hardware.py`
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    with Screen() as screen, Scanner() as scanner:
        print(f"Lezer: {scanner.name}. Ctrl-C om te stoppen.")
        screen.show("    Scan je", " studentenkaart")
        try:
            for card in scanner:
                print(card)
                serial = card.split(";")[0]
                screen.show("Gelezen:", serial)
                time.sleep(2)
                screen.show("    Scan je", " studentenkaart")
        except KeyboardInterrupt:
            screen.clear()
