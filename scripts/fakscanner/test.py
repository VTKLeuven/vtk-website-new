import argparse
import logging
import os
import sys
import time
import requests
from logging.handlers import RotatingFileHandler
from hardware import Screen, Scanner

# env
# ---
API_BASE = os.environ.get("API_BASE", "https://dev.vtk.be").rstrip("/")
SCAN_URL = f"{API_BASE}/api/fakscanner/scan"

LOG_FILE = os.environ.get("FAKSCANNER_LOG_FILE", "./fakscanner.log")
TOKEN = os.environ.get("FAKSCANNER_TOKEN", "")

# Logging
# -------
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


# hardware init
# -------------
screen = Screen(1, 0x27) # bus, addr
screen.show("Starting ...")
logger.info("Initializing script")

try:
    scanner = Scanner()
    logger.info(f"Cardscanner found: {scanner.name}")
except:
    screen.show("Geen cardscanner", "gevonden")
    logger.error("Geen cardscanner gevonden")
    exit()

try:
    requests.get(API_BASE)
    logger.info(f"Verbonden met {API_BASE}")
except:
    screen.show("Geen verbinding", f"met {API_BASE}")
    logger.error("Geen cardscanner gevonden")
    exit()

while True:
    screen.show("    Scan je     ", " Studentenkaart ")

    card = scanner.read() # wacht op studentenkaart

    try:
        response = requests.post(
            SCAN_URL,
            json={"card": card},
            headers={"Authorization": f"Bearer {TOKEN}"},
            timeout=8,
        )
    except requests.exceptions.RequestException as exc:
        screen.show("Geen verbinding", f"met {API_BASE}")
        logger.info(f"Geen verbinding met de site: {exc}")
        time.sleep(10)
        
    print(response)


# start main loop
#   wait for cardscan
#   read and verify card
#   send request to (dev.)vtk.be
#   await response
#   display information and scans
#   repeat




