import argparse
import logging
import os
import sys
import time
from logging.handlers import RotatingFileHandler
from hardware import Screen, Scanner

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

def log(message):
    logger.info(message)


# hardware init
# -------------
screen = Screen(1, 0x27) # bus, addr
screen.show("Starting ...")
log("Initializing script")

try:
    scanner = Scanner()
    log('Cardscanner founf: ${scanner.name}')
except:
    screen.show("Geen cardscanner", "gevonden")
    log("Geen cardscanner gevonden")
    exit()





