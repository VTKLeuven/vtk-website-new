#!/usr/bin/env python3
#
# VTK website-deuragent (Raspberry Pi)
# ------------------------------
# Draait op de Pi aan de deur. Twee dingen tegelijk:
#
#   1. Kaartscan-lus (stdin): de KU Leuven-kaartlezer gedraagt zich als een
#      toetsenbord en "typt" `serial;cardAppId` + Enter. We sturen die ruwe scan
#      naar de website (`/api/door/scan`); die verifieert de kaart bij KU Leuven,
#      zoekt de gebruiker op en beslist allow/deny. Bij `allowed` openen we de
#      GPIO-lock. Valt de site/internet weg, dan beslissen we op de offline-cache
#      en bufferen we het event tot de site terug bereikbaar is.
#
#   2. Remote-open listener (HTTP): de main-server roept ons rechtstreeks aan over
#      Tailscale (`POST /open`) wanneer iemand met `door.remoteOpen` op de
#      dashboardknop drukt. Near-instant, geen polling.
#
# Beide kanten authenticeren op hetzelfde gedeelde secret (`DOOR_DEVICE_SECRET`),
# hetzelfde dat in de website onder Admin -> IT staat.
#
# Config gebeurt volledig via omgevingsvariabelen (zie het README en de
# systemd-unit). Afhankelijkheden: `requests` en (op een echte Pi) `RPi.GPIO`.
#
# Staat bewust naast de oude Litus-`door.py` tijdens de migratie.

import json
import os
import sys
import time
import logging
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from logging.handlers import RotatingFileHandler

import requests

# ---------------------------------------------------------------------------
# Config (env)
# ---------------------------------------------------------------------------

API_BASE = os.environ.get("API_BASE", "https://vtk.be").rstrip("/")
DEVICE_SECRET = os.environ.get("DOOR_DEVICE_SECRET", "")

LISTEN_HOST = os.environ.get("DOOR_LISTEN_HOST", "0.0.0.0")
LISTEN_PORT = int(os.environ.get("DOOR_LISTEN_PORT", "8080"))
INPUT_DEVICE = os.environ.get("DOOR_INPUT_DEVICE", "").strip()
INPUT_RETRY_SECONDS = float(os.environ.get("DOOR_INPUT_RETRY_SECONDS", "3"))

GPIO_PORT = int(os.environ.get("DOOR_GPIO_PORT", "7"))
UNLOCK_SECONDS = float(os.environ.get("DOOR_UNLOCK_SECONDS", "5"))

REQUEST_TIMEOUT = float(os.environ.get("DOOR_REQUEST_TIMEOUT", "5"))
CACHE_TTL = float(os.environ.get("DOOR_CACHE_TTL", "3600"))  # offline-cache geldigheid (s)
FLUSH_INTERVAL = float(os.environ.get("DOOR_FLUSH_INTERVAL", "60"))  # queue-flush poging (s)

CACHE_FILE = os.environ.get("DOOR_CACHE_FILE", "./door_cache.json")
QUEUE_FILE = os.environ.get("DOOR_QUEUE_FILE", "./door_queue.json")
LOG_FILE = os.environ.get("DOOR_LOG_FILE", "./door.log")

# Zet DEBUG=1 om zonder RPi-hardware te draaien (GPIO wordt dan enkel gelogd).
DEBUG = os.environ.get("DOOR_DEBUG", "").strip() not in ("", "0", "false", "False")

SCAN_URL = f"{API_BASE}/api/door/scan"
LOGS_URL = f"{API_BASE}/api/door/logs"

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logger = logging.getLogger("door")
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
# GPIO
# ---------------------------------------------------------------------------

_gpio_lock = threading.Lock()  # zodat scan en remote-open elkaar niet overlappen
GPIO = None

if not DEBUG:
    try:
        import RPi.GPIO as GPIO  # type: ignore

        GPIO.setmode(GPIO.BOARD)
        GPIO.setwarnings(False)
        GPIO.setup(GPIO_PORT, GPIO.OUT)
        GPIO.output(GPIO_PORT, GPIO.LOW)
    except Exception as exc:  # noqa: BLE001
        log(f"GPIO niet beschikbaar ({exc}); val terug op DEBUG-modus.")
        DEBUG = True
        GPIO = None


def open_door(seconds=None, source="card"):
    """Ontgrendelt de deur voor `seconds` (default UNLOCK_SECONDS). Thread-safe."""
    duration = UNLOCK_SECONDS if not seconds or seconds <= 0 else float(seconds)
    with _gpio_lock:
        if DEBUG or GPIO is None:
            log(f"DEBUG: deur zou nu {duration:.0f}s open gaan ({source})")
            time.sleep(min(duration, 0.2))
            return True
        for attempt in range(3):
            try:
                GPIO.output(GPIO_PORT, GPIO.HIGH)
                time.sleep(duration)
                GPIO.output(GPIO_PORT, GPIO.LOW)
                log(f"Deur geopend ({source}, {duration:.0f}s)")
                return True
            except Exception as exc:  # noqa: BLE001
                log(f"Deur openen mislukt (poging {attempt + 1}/3): {exc}")
                time.sleep(1)
        log("CRITICAL: deur openen mislukt na 3 pogingen")
        return False


# ---------------------------------------------------------------------------
# Offline-cache + log-queue (JSON op schijf)
# ---------------------------------------------------------------------------

_state_lock = threading.Lock()


def _load_json(path, default):
    try:
        with open(path, "r") as handle:
            return json.load(handle)
    except FileNotFoundError:
        return default
    except Exception as exc:  # noqa: BLE001
        log(f"Kon {path} niet lezen ({exc}); start leeg.")
        return default


def _save_json(path, data):
    tmp = f"{path}.tmp"
    try:
        with open(tmp, "w") as handle:
            json.dump(data, handle)
        os.replace(tmp, path)
    except Exception as exc:  # noqa: BLE001
        log(f"Kon {path} niet schrijven ({exc}).")


def cache_get(card):
    with _state_lock:
        cache = _load_json(CACHE_FILE, {})
    entry = cache.get(card.lower())
    if not entry:
        return None
    if time.time() - entry.get("ts", 0) > CACHE_TTL:
        return None
    return entry


def cache_put(card, allowed, person, rnumber):
    with _state_lock:
        cache = _load_json(CACHE_FILE, {})
        cache[card.lower()] = {
            "ts": time.time(),
            "allowed": bool(allowed),
            "person": person,
            "rNumber": rnumber,
        }
        _save_json(CACHE_FILE, cache)


def queue_event(result, rnumber=None, card_name=None, reason=None):
    """Buffert een deurgebeurtenis om later naar /api/door/logs te flushen."""
    with _state_lock:
        queue = _load_json(QUEUE_FILE, [])
        queue.append(
            {
                "result": result,
                "method": "CARD",
                "rNumber": rnumber,
                "cardName": card_name,
                "reason": reason,
                "at": _iso_now(),
            }
        )
        _save_json(QUEUE_FILE, queue[-1000:])  # cap zodat het bestand niet ontploft


def _iso_now():
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()) + "Z"


def flush_queue():
    """Stuurt gebufferde events naar de site. Stil falen wanneer offline."""
    with _state_lock:
        queue = _load_json(QUEUE_FILE, [])
    if not queue:
        return
    try:
        resp = requests.post(
            LOGS_URL,
            headers=_auth_headers(),
            json={"entries": queue},
            timeout=REQUEST_TIMEOUT,
        )
        if resp.status_code == 200:
            with _state_lock:
                # Enkel de zonet verstuurde events wegnemen; nieuwe die intussen
                # binnenkwamen blijven staan.
                current = _load_json(QUEUE_FILE, [])
                _save_json(QUEUE_FILE, current[len(queue):])
            log(f"{len(queue)} offline-event(s) geflusht naar de site.")
        else:
            log(f"Queue-flush kreeg HTTP {resp.status_code}; probeer later opnieuw.")
    except requests.RequestException:
        pass  # nog steeds offline; later opnieuw


# ---------------------------------------------------------------------------
# Kaartscan
# ---------------------------------------------------------------------------

def _auth_headers():
    return {"Authorization": f"Bearer {DEVICE_SECRET}", "Content-Type": "application/json"}


def handle_scan(card):
    card = card.strip()
    if not card:
        return
    try:
        resp = requests.post(
            SCAN_URL,
            headers=_auth_headers(),
            json={"card": card},
            timeout=REQUEST_TIMEOUT,
        )
    except requests.RequestException as exc:
        log(f"Site onbereikbaar ({exc}); val terug op offline-cache.")
        handle_offline(card)
        return

    if resp.status_code == 401:
        log("Site weigert het device-secret (401). Controleer DOOR_DEVICE_SECRET.")
        return
    if resp.status_code >= 500:
        log(f"Site-fout HTTP {resp.status_code}; val terug op offline-cache.")
        handle_offline(card)
        return

    try:
        data = resp.json()
    except ValueError:
        log("Onleesbare respons van de site.")
        return

    allowed = bool(data.get("allowed"))
    person = data.get("person")
    reason = data.get("reason")
    unlock = data.get("unlockSeconds")
    rnumber = data.get("rNumber")  # meestal niet meegegeven; enkel voor cache indien wel

    # Cache voor offline-gebruik. De site logt online zelf, dus wij loggen niet.
    cache_put(card, allowed, person, rnumber)

    if allowed:
        log(f"Toegelaten: {person or 'onbekend'}")
        open_door(unlock, source="card")
    else:
        log(f"Geweigerd: {person or card} ({reason or 'geen toegang'})")

    # Opportunistisch: nu we online blijken, gebufferde events wegwerken.
    flush_queue()


def handle_offline(card):
    """Beslist op de offline-cache wanneer de site onbereikbaar is."""
    entry = cache_get(card)
    if entry is None:
        log("Geen (geldige) cache voor deze kaart; deur blijft dicht.")
        queue_event("ERROR", reason="offline_no_cache")
        return
    if entry.get("allowed"):
        log(f"Offline-cache: toegelaten ({entry.get('person') or 'onbekend'}).")
        open_door(source="card")
        queue_event("ALLOWED", rnumber=entry.get("rNumber"), card_name=entry.get("person"), reason="offline_cache")
    else:
        log("Offline-cache: geweigerd.")
        queue_event("DENIED", rnumber=entry.get("rNumber"), card_name=entry.get("person"), reason="offline_cache")


def scan_stdin():
    """Leest scans als tekst van stdin, vooral voor handmatige/debug-runs."""
    for line in sys.stdin:
        card = line.strip()
        if card == "STOP":
            return
        if card:
            try:
                handle_scan(card)
            except Exception as exc:  # noqa: BLE001
                log(f"Onverwachte fout bij scan: {exc}")
                time.sleep(0.5)
    log("stdin is gesloten; kaartscan-worker stopt (remote-open blijft actief).")


def scan_input_device():
    """Leest een USB-keyboardscanner rechtstreeks via Linux evdev."""
    from evdev import InputDevice, ecodes  # type: ignore

    keymap = {
        ecodes.KEY_0: "0",
        ecodes.KEY_1: "1",
        ecodes.KEY_2: "2",
        ecodes.KEY_3: "3",
        ecodes.KEY_4: "4",
        ecodes.KEY_5: "5",
        ecodes.KEY_6: "6",
        ecodes.KEY_7: "7",
        ecodes.KEY_8: "8",
        ecodes.KEY_9: "9",
        ecodes.KEY_MINUS: "-",
        ecodes.KEY_EQUAL: "=",
        ecodes.KEY_LEFTBRACE: "[",
        ecodes.KEY_RIGHTBRACE: "]",
        ecodes.KEY_BACKSLASH: "\\",
        ecodes.KEY_SEMICOLON: ";",
        ecodes.KEY_APOSTROPHE: "'",
        ecodes.KEY_GRAVE: "`",
        ecodes.KEY_COMMA: ",",
        ecodes.KEY_DOT: ".",
        ecodes.KEY_SLASH: "/",
        ecodes.KEY_SPACE: " ",
        ecodes.KEY_KP0: "0",
        ecodes.KEY_KP1: "1",
        ecodes.KEY_KP2: "2",
        ecodes.KEY_KP3: "3",
        ecodes.KEY_KP4: "4",
        ecodes.KEY_KP5: "5",
        ecodes.KEY_KP6: "6",
        ecodes.KEY_KP7: "7",
        ecodes.KEY_KP8: "8",
        ecodes.KEY_KP9: "9",
        ecodes.KEY_KPDOT: ".",
        ecodes.KEY_KPMINUS: "-",
        ecodes.KEY_KPPLUS: "+",
        ecodes.KEY_KPSLASH: "/",
        ecodes.KEY_KPASTERISK: "*",
    }
    for letter in "abcdefghijklmnopqrstuvwxyz":
        keymap[getattr(ecodes, f"KEY_{letter.upper()}")] = letter

    shifted = {
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
        "-": "_",
        "=": "+",
        "[": "{",
        "]": "}",
        "\\": "|",
        ";": ":",
        "'": '"',
        "`": "~",
        ",": "<",
        ".": ">",
        "/": "?",
    }
    enter_keys = {ecodes.KEY_ENTER, ecodes.KEY_KPENTER}
    shift_keys = {ecodes.KEY_LEFTSHIFT, ecodes.KEY_RIGHTSHIFT}

    while True:
        device = None
        try:
            device = InputDevice(INPUT_DEVICE)
            # Geen EVIOCGRAB: tijdens de migratie moet de oude door.py dezelfde
            # keyboardscanner parallel kunnen blijven ontvangen.
            log(f"Kaartlezer verbonden: {INPUT_DEVICE} ({device.name})")
            buffer = []
            shift_down = set()

            for event in device.read_loop():
                if event.type != ecodes.EV_KEY:
                    continue
                if event.code in shift_keys:
                    if event.value == 1:
                        shift_down.add(event.code)
                    elif event.value == 0:
                        shift_down.discard(event.code)
                    continue
                if event.value != 1:  # enkel key-down; negeer release/repeat
                    continue
                if event.code in enter_keys:
                    card = "".join(buffer).strip()
                    buffer.clear()
                    if card:
                        try:
                            handle_scan(card)
                        except Exception as exc:  # noqa: BLE001
                            log(f"Onverwachte fout bij scan: {exc}")
                    continue
                if event.code == ecodes.KEY_BACKSPACE:
                    if buffer:
                        buffer.pop()
                    continue

                char = keymap.get(event.code)
                if char:
                    if shift_down:
                        char = shifted.get(char, char.upper())
                    buffer.append(char)
        except OSError as exc:
            log(
                f"Kaartlezer niet beschikbaar ({exc}); "
                f"probeer opnieuw over {INPUT_RETRY_SECONDS:g}s."
            )
        finally:
            if device is not None:
                try:
                    device.close()
                except OSError:
                    pass
        time.sleep(INPUT_RETRY_SECONDS)


# ---------------------------------------------------------------------------
# Remote-open listener (HTTP over Tailscale)
# ---------------------------------------------------------------------------

class DoorHandler(BaseHTTPRequestHandler):
    def _reply(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _authorized(self):
        return DEVICE_SECRET and self.headers.get("Authorization") == f"Bearer {DEVICE_SECRET}"

    def do_GET(self):  # noqa: N802
        if self.path.rstrip("/") == "/health":
            if not self._authorized():
                return self._reply(401, {"error": "unauthorized"})
            return self._reply(200, {"status": "ok"})
        self._reply(404, {"error": "not_found"})

    def do_POST(self):  # noqa: N802
        if self.path.rstrip("/") == "/open":
            if not self._authorized():
                return self._reply(401, {"error": "unauthorized"})
            seconds = None
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if length:
                    body = json.loads(self.rfile.read(length) or b"{}")
                    seconds = body.get("unlockSeconds")
            except Exception:  # noqa: BLE001
                seconds = None
            opened = open_door(seconds, source="remote")
            return self._reply(200 if opened else 500, {"opened": opened})
        self._reply(404, {"error": "not_found"})

    def log_message(self, *_args):  # stil: we loggen zelf via `log()`
        return


def serve_listener():
    server = ThreadingHTTPServer((LISTEN_HOST, LISTEN_PORT), DoorHandler)
    log(f"Remote-open listener op {LISTEN_HOST}:{LISTEN_PORT}")
    server.serve_forever()


def flush_daemon():
    while True:
        time.sleep(FLUSH_INTERVAL)
        try:
            flush_queue()
        except Exception as exc:  # noqa: BLE001
            log(f"Queue-flush-daemon fout: {exc}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    if not DEVICE_SECRET:
        log("WAARSCHUWING: DOOR_DEVICE_SECRET is leeg. De site en remote-open zullen weigeren.")
    log(f"Deurscanner gestart (API_BASE={API_BASE}, DEBUG={DEBUG}).")

    if INPUT_DEVICE:
        try:
            import evdev  # noqa: F401
        except ImportError:
            log("python3-evdev ontbreekt; installeer het pakket om DOOR_INPUT_DEVICE te gebruiken.")
            return 1

    scan_target = scan_input_device if INPUT_DEVICE else scan_stdin
    threading.Thread(target=scan_target, daemon=True).start()
    threading.Thread(target=flush_daemon, daemon=True).start()
    flush_queue()  # meteen proberen bij opstart

    try:
        # De listener bepaalt de levensduur van het proces. Een ontbrekende of
        # losgekoppelde kaartlezer schakelt remote-open daardoor niet meer uit.
        serve_listener()
    except KeyboardInterrupt:
        pass
    finally:
        log("Deurscanner stopt.")
        if not DEBUG and GPIO is not None:
            try:
                GPIO.cleanup()
            except Exception:  # noqa: BLE001
                pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
