#!/usr/bin/env python3
#
# VTK fakscanner (Raspberry Pi aan de bar)
# ----------------------------------------
# De KU Leuven-kaartlezer gedraagt zich als een toetsenbord en "typt"
# `serial;cardAppId` + Enter. Wij sturen die ruwe scan door naar de website
# (`POST /api/fakscanner/scan`) en tonen het antwoord op het schermpje: hoeveel
# punten het lid staat, en of er een gratis pint bij hoort.
#
# Verschil met de oude Litus-versie van dit script: de KU Leuven-verificatie
# gebeurt niet meer hier maar op de server. De Pi heeft dus geen KU Leuven-
# credentials meer nodig, enkel een token voor onze eigen site, en de site houdt
# zelf een kaart-naar-r-nummer-map bij zodat een tweede scan van dezelfde kaart
# niet opnieuw bij KU Leuven hoeft te passeren.
#
# Config gebeurt volledig via omgevingsvariabelen (zie het blok hieronder).
# Afhankelijkheden: `requests`, en op een echte Pi optioneel `RPi.GPIO` (lampje),
# `drivers` (het I2C-LCD uit de Litus-opstelling) en `pyscard` (de LED in de
# lezer). Ontbreekt er een, dan valt dat stuk gewoon weg en blijft de rest werken.
#
#   FAKSCANNER_TOKEN=... python3 scripts/fakscanner.py
#   python3 scripts/fakscanner.py --test-led     # enkel de LED uitproberen

import argparse
import logging
import os
import sys
import time
from logging.handlers import RotatingFileHandler

import requests

# ---------------------------------------------------------------------------
# Config (env)
# ---------------------------------------------------------------------------

API_BASE = os.environ.get("API_BASE", "https://vtk.be").rstrip("/")
TOKEN = os.environ.get("FAKSCANNER_TOKEN", "")
SCAN_URL = f"{API_BASE}/api/fakscanner/scan"

REQUEST_TIMEOUT = float(os.environ.get("FAKSCANNER_REQUEST_TIMEOUT", "8"))
LOG_FILE = os.environ.get("FAKSCANNER_LOG_FILE", "./fakscanner.log")

# Lampje boven de bar (optioneel), aan zolang de gratis pint op het scherm staat.
GPIO_PORT = int(os.environ.get("FAKSCANNER_GPIO_PORT", "26"))
GPIO_ENABLED = os.environ.get("FAKSCANNER_GPIO", "1").strip() not in ("", "0", "false", "False")

# Hoelang "GRATIS PINT" blijft staan (seconden).
BEER_SECONDS = float(os.environ.get("FAKSCANNER_BEER_SECONDS", "6"))

# ---------------------------------------------------------------------------
# LED van de lezer (SpringCard Prox'n'Roll RFID, snr EX3066-AA)
# ---------------------------------------------------------------------------
#
# De Prox'n'Roll heeft een meerkleurige LED die je via een PC/SC vendor escape
# aanstuurt. Kleur en duur kies je hieronder; zet FAKSCANNER_LED_COLOR op een van
# de namen in LED_COLORS.
#
# LET OP, twee dingen die je op de Pi moet nakijken voor dit werkt:
#
#   1. Escape-commando's zijn standaard uitgeschakeld in de CCID-driver. Zet in
#      /etc/libccid_Info.plist de sleutel `ifdDriverOptions` op `0x0001` en
#      herstart pcscd.
#   2. Draait de lezer in toetsenbordmodus (HID), dan biedt hij mogelijk geen
#      PC/SC-interface aan en faalt de LED-aansturing. Zet hem dan met de
#      SpringCard-configuratietool in de gecombineerde modus, of gebruik enkel
#      het GPIO-lampje hierboven.
#
# De bytes van het escape-commando komen uit de PC/SC vendor-documentatie van
# SpringCard en verschillen per firmware. Werkt de default niet, probeer dan
# `--test-led` met een andere FAKSCANNER_LED_ESCAPE (hex, zonder spaties).

LED_ESCAPE = os.environ.get("FAKSCANNER_LED_ESCAPE", "581E")
LED_CONTROL_CODE = int(os.environ.get("FAKSCANNER_LED_CONTROL_CODE", "0"), 0)
LED_ENABLED = os.environ.get("FAKSCANNER_LED", "1").strip() not in ("", "0", "false", "False")

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

# Kleur waarin de lezer oplicht bij een gratis pint. Pas dit aan naar smaak.
LED_COLOR = os.environ.get("FAKSCANNER_LED_COLOR", "paars").strip().lower()

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logger = logging.getLogger("fakscanner")
logger.setLevel(logging.INFO)
_fmt = logging.Formatter("[%(asctime)s] %(levelname)s: %(message)s", "%x %H:%M:%S")
try:
    _fh = RotatingFileHandler(LOG_FILE, maxBytes=5 * 1024 * 1024, backupCount=3)
    _fh.setFormatter(_fmt)
    logger.addHandler(_fh)
except Exception as exc:  # noqa: BLE001
    print(f"Kon logbestand niet openen ({exc}); enkel stdout.")
_sh = logging.StreamHandler(sys.stdout)
_sh.setFormatter(_fmt)
logger.addHandler(_sh)


def log(message):
    logger.info(message)


# ---------------------------------------------------------------------------
# LCD (16x2, optioneel)
# ---------------------------------------------------------------------------

display = None
if os.environ.get("FAKSCANNER_LCD", "1").strip() not in ("", "0", "false", "False"):
    try:
        import drivers  # type: ignore

        display = drivers.Lcd() if hasattr(drivers, "Lcd") else drivers.lcd()
    except Exception as exc:  # noqa: BLE001
        log(f"Geen LCD gevonden ({exc}); de meldingen gaan enkel naar stdout.")
        display = None


def show(line1, line2=""):
    """Twee regels van zestien tekens; langer wordt afgekapt."""
    log(f"scherm: {line1} | {line2}")
    if display is None:
        return
    try:
        display.lcd_clear()
        display.lcd_display_string(line1[:16].ljust(16), 1)
        display.lcd_display_string(line2[:16].ljust(16), 2)
    except Exception as exc:  # noqa: BLE001
        log(f"LCD schrijven mislukt: {exc}")


def show_default():
    show("    Scan je", " studentenkaart")


# ---------------------------------------------------------------------------
# GPIO-lampje (optioneel)
# ---------------------------------------------------------------------------

gpio = None
if GPIO_ENABLED:
    try:
        import RPi.GPIO as GPIO  # type: ignore

        GPIO.setwarnings(False)
        GPIO.setmode(GPIO.BCM)
        GPIO.setup(GPIO_PORT, GPIO.OUT)
        GPIO.output(GPIO_PORT, 0)
        gpio = GPIO
    except Exception as exc:  # noqa: BLE001
        log(f"Geen GPIO beschikbaar ({exc}); het lampje blijft uit.")
        gpio = None


def lamp(on):
    if gpio is None:
        return
    try:
        gpio.output(GPIO_PORT, 1 if on else 0)
    except Exception as exc:  # noqa: BLE001
        log(f"GPIO schakelen mislukt: {exc}")


# ---------------------------------------------------------------------------
# LED in de lezer
# ---------------------------------------------------------------------------


def _led_connection():
    """Directe PC/SC-verbinding met de lezer, ook zonder kaart erop."""
    from smartcard.scard import (  # type: ignore
        SCARD_LEAVE_CARD,
        SCARD_SHARE_DIRECT,
    )
    from smartcard.System import readers  # type: ignore

    available = readers()
    if not available:
        raise RuntimeError("geen PC/SC-lezer gevonden")
    connection = available[0].createConnection()
    connection.connect(mode=SCARD_SHARE_DIRECT, disposition=SCARD_LEAVE_CARD)
    return connection


def _control_code():
    if LED_CONTROL_CODE:
        return LED_CONTROL_CODE
    from smartcard.scard import SCARD_CTL_CODE  # type: ignore

    # 1 is de escape-code van pcsc-lite (Linux); Windows gebruikt 2048/3500.
    return SCARD_CTL_CODE(1)


def led(color_name, seconds=0.0):
    """
    Zet de LED van de lezer in een kleur, optioneel voor een beperkte tijd.
    Faalt dit (verkeerde modus, driver zonder escape, geen pyscard), dan loggen we
    het en gaat de rest gewoon door: een kaartlezer die niet oplicht is vervelend,
    een kaartlezer die niet meer telt is een probleem.
    """
    if not LED_ENABLED:
        return
    mask = LED_COLORS.get(color_name)
    if mask is None:
        log(f"Onbekende LED-kleur '{color_name}'; kies uit {', '.join(LED_COLORS)}.")
        return
    try:
        connection = _led_connection()
        try:
            command = list(bytes.fromhex(LED_ESCAPE)) + [mask]
            connection.control(_control_code(), command)
            if seconds > 0:
                time.sleep(seconds)
                connection.control(_control_code(), list(bytes.fromhex(LED_ESCAPE)) + [LED_COLORS["uit"]])
        finally:
            connection.disconnect()
    except Exception as exc:  # noqa: BLE001
        log(f"LED aansturen mislukt: {exc}")
        if seconds > 0:
            time.sleep(seconds)


# ---------------------------------------------------------------------------
# Site
# ---------------------------------------------------------------------------


def post_scan(card):
    """
    Stuurt één scan naar de site. Geeft (ok, payload_of_foutmelding) terug; de
    foutmelding is kort genoeg voor het schermpje.
    """
    try:
        response = requests.post(
            SCAN_URL,
            json={"card": card},
            headers={"Authorization": f"Bearer {TOKEN}"},
            timeout=REQUEST_TIMEOUT,
        )
    except requests.exceptions.RequestException as exc:
        log(f"Geen verbinding met de site: {exc}")
        return False, "Geen netwerk"

    try:
        payload = response.json()
    except ValueError:
        log(f"Onleesbaar antwoord van de site (status {response.status_code}).")
        return False, "Site-fout"

    if not payload.get("ok"):
        # De site zet er zelf een korte, tonbare zin in.
        return False, payload.get("error") or "Site-fout"
    return True, payload


# ---------------------------------------------------------------------------
# Afhandeling van één scan
# ---------------------------------------------------------------------------


def first_name(payload):
    """Enkel de voornaam past op zestien tekens."""
    name = (payload.get("name") or payload.get("rNumber") or "").strip()
    return name.split(" ")[0] if name else "?"


def handle(card):
    ok, result = post_scan(card)
    if not ok:
        show(str(result).upper()[:16], " PROBEER OPNIEUW")
        time.sleep(2)
        show_default()
        return

    person = first_name(result)
    total = result.get("total", 0)

    if not result.get("counted"):
        show(f"{person} was al", "ingecheckt")
        time.sleep(1.5)
        show(f"Al {total} punten!", "")
        time.sleep(1.5)
        show_default()
        return

    if result.get("double"):
        show("    Dubbele", "    Checkin!")
        time.sleep(1.5)

    if result.get("freeBeer"):
        lamp(True)
        # De LED houdt de kleur zolang het bericht op het scherm staat.
        led(LED_COLOR)
        deadline = time.time() + BEER_SECONDS
        while time.time() < deadline:
            show("! GRATIS PINT !", f" {total} punten!")
            time.sleep(1)
            show("! GRATIS PINT !", f" Voor {person}")
            time.sleep(2)
        led("uit")
        lamp(False)
    else:
        to_next = result.get("toNextBeer")
        second = f"Nog {to_next} tot pint" if to_next else f"Al {total} punten!"
        show(f"Hallo, {person}", second)
        time.sleep(2)

    show_default()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(description="VTK fakscanner (kaartlezer aan de bar)")
    parser.add_argument(
        "--test-led",
        action="store_true",
        help="zet de LED even in de ingestelde kleur en stop; om de escape-bytes uit te proberen",
    )
    args = parser.parse_args()

    if args.test_led:
        print(f"LED in '{LED_COLOR}' via escape {LED_ESCAPE} ...")
        led(LED_COLOR, seconds=3)
        return

    if not TOKEN:
        print("FAKSCANNER_TOKEN ontbreekt; zet hem in de omgeving (zie .env.example).")
        sys.exit(1)

    log(f"Fakscanner gestart, site: {SCAN_URL}")
    show_default()

    while True:
        try:
            card = input().strip()
        except (EOFError, KeyboardInterrupt):
            log("Gestopt.")
            break
        if not card:
            continue
        if card == "STOP":
            log("STOP gescand; gestopt.")
            break
        handle(card)

    lamp(False)
    led("uit")


if __name__ == "__main__":
    main()
