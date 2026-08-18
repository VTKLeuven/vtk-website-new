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

# helper functions
# ----------------

def center_text(text, width=16):
    return text.center(width)

# hardware init
# -------------
logger.info("Initializing script")
try:
    screen = Screen(1, 0x27) # bus, addr
    screen.show("Starting ...")
except:
    logger.error("Could not find LCD screen => check of pinnen correct verbonden zijn")
    exit()

try:
    scanner = Scanner()
    logger.info(f"CardScanner found: {scanner.name}")
except:
    screen.show("Geen CardScanner", "gevonden")
    logger.error("Geen CardScanner gevonden")
    exit()

try:
    requests.get(API_BASE, timeout=15)
    logger.info(f"Verbonden met {API_BASE}")
except:
    screen.show("Geen verbinding", f"met {API_BASE}")
    logger.error("Geen CardScanner gevonden")
    exit()

# Scan loop
# ---------
while True:
    screen.show("    Scan je     ", " Studentenkaart ")

    try:
        card = scanner.read() # wacht op studentenkaart
    except:
        screen.show("  Kaartscanner  ", "      fout      ")
        logger.error("Geen CardScanner gevonden")
        exit()

    try:
        response = requests.post(
            SCAN_URL,
            json={"card": card},
            headers={"Authorization": f"Bearer {TOKEN}"},
            timeout=8,
        )
    except requests.exceptions.RequestException as exc:
        screen.show("Geen verbinding", f"met {API_BASE}")
        logger.error(f"Geen verbinding met de site: {exc}")
        time.sleep(10)
        continue
    
    try:
        response = response.json()
        # {'ok': True, 'counted': False, 'rNumber': 'r0939342', 'name': 'Witse Panneels', 'total': 1, 'points': 0, 'double': False, 'freeBeer': False, 'toNextBeer': 9, 'message': 'Al ingecheckt'}
    except:
        screen.show("Website Error :(", " probeer opnieuw")
        logger.error(f"Website error: {response}")
        time.sleep(10)
        continue
    
    if response["ok"] == False:
        logger.error(f"Scan failed: {response["error"]}")
        screen.show(response["error"])
        time.sleep(10)
        continue
    
    naam = ""
    if response["name"]:
        naam = response["name"]
    else:
        naam = response["rNumber"]
    
    if response["counted"] == False:
        screen.show(center_text(response["message"]), f"  {response["total"]} CheckIns  ")
        time.sleep(10)
        continue
    
    if response["double"]:
        screen.show("Dubbele CheckIn!", center_text(naam))
        time.sleep(3)
    
    if response["freeBeer"]:
        screen.show("  Gratis Pint!  ", center_text(naam))
        for i in range(3):
            for j in range(4):
                time.sleep(0.1)
                screen.backlight(False)
                time.sleep(0.1)
                screen.backlight(True)
            time.sleep(2)
        time.sleep(10)
        continue
    
    screen.show(center_text(naam), f"  {response["total"]} CheckIns  ")
    time.sleep(7)

# start main loop
#   wait for cardscan
#   read and verify card
#   send request to (dev.)vtk.be
#   await response
#   display information and scans
#   repeat

# {'ok': True, 'counted': False, 'rNumber': 'r0939342', 'name': 'Witse Panneels', 'total': 1, 'points': 0, 'double': False, 'freeBeer': False, 'toNextBeer': 9, 'message': 'Al ingecheckt'}



