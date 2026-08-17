#!/usr/bin/env python3
#
# VTK fakscanner
# ----------------------------------------

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

BEER_SECONDS = float(os.environ.get("FAKSCANNER_BEER_SECONDS", "6"))

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
# LCD
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
