import argparse
import os
import sys
import time
from smbus2 import SMBus # type:ignore

# LCD
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

LCD = Lcd(LCD_BUS_DEFAULT, LCD_ADDR_DEFAULT);

LCD.write("hello world!")