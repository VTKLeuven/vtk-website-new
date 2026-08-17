#!/usr/bin/env python3
#
# VTK praesidium-historiek scraper
# --------------------------------
# Haalt de historische praesidiumpagina's van de oude site
# (https://vtk.be/praesidium/overview/<jaar>-<jaar+1>/) op en zet ze om naar
# `scripts/praesidium-history-raw.json`, klaar voor import in de nieuwe site.
#
# Enkel stdlib: urllib voor het ophalen, html.parser voor het parsen. Dit script
# moet op elke machine kunnen draaien zonder eerst pip te openen.
#
# De relevante HTML ziet er zo uit (binnen de ene .container die memberHolders
# bevat; de andere .container-divs zijn nav en footer):
#
#   <div ...><h3>Activiteiten</h3><h5>...</h5></div>
#   <div class="memberHolder">
#     <div class="member">
#       <div class="memberPhoto" style="background-image: url(/_common/profile//<sha1>)"></div>
#       <h4>Naam </h4>
#       <p>Groepscoördinator</p>   <!-- optioneel; kan ook een echte titel zijn -->
#       <p>Praeses</p>             <!-- meerdere <p> per lid zijn mogelijk -->
#     </div>
#     ...
#
#   python3 scripts/scrape-praesidium.py

import json
import re
import sys
import time
import urllib.error
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

# 2026-2027 wordt bewust niet gescraped.
START_YEARS = range(2006, 2026)

BASE_URL = "https://vtk.be/praesidium/overview/{start}-{end}/"
OUTPUT_PATH = Path(__file__).resolve().parent / "praesidium-history-raw.json"

USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)
TIMEOUT_SECONDS = 20
RETRY_PAUSE_SECONDS = 2.0
POLITE_PAUSE_SECONDS = 0.5

# De footersecties beginnen met deze koppen; alles vanaf daar is geen praesidium.
FOOTER_HEADINGS = {"partners", "links"}

PHOTO_PREFIX = "/_common/profile/"
PHOTO_URL_RE = re.compile(r"url\(\s*['\"]?(?P<path>[^'\")]+)['\"]?\s*\)")
HEX40_RE = re.compile(r"^[0-9a-fA-F]{40}$")

# U+200E LEFT-TO-RIGHT MARK zit achter een aantal namen geplakt.
LRM = "‎"


def normalize_text(value):
    """Trim, gooi de LRM weg en plet interne witruimte tot enkele spaties."""
    cleaned = value.replace(LRM, " ").replace("\xa0", " ")
    return " ".join(cleaned.split())


def has_class(attrs, name):
    """True als het class-attribuut `name` als los token bevat."""
    return name in (attrs.get("class") or "").split()


def parse_photo_hash(style):
    """Haal de 40-hex profielhash uit een `background-image: url(...)`-style."""
    if not style:
        return None
    match = PHOTO_URL_RE.search(style)
    if not match:
        return None
    path = match.group("path").strip()
    if not path.startswith(PHOTO_PREFIX):
        return None
    # Op de meeste pagina's staat er een dubbele slash na /profile/.
    remainder = path[len(PHOTO_PREFIX) :].strip("/")
    return remainder if HEX40_RE.match(remainder) else None


class PraesidiumParser(HTMLParser):
    """Streamt de pagina en bouwt de groepen met hun leden op.

    De laatst geziene <h3> is de groepsnaam; die wordt vastgeklikt zodra de
    volgende div.memberHolder opent. Zo hoeven we geen DOM te bouwen.
    """

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.groups = []
        self._done = False
        self._div_depth = 0
        self._holder_depth = None
        self._member_depth = None
        self._pending_group = None
        self._current_group = None
        self._current_member = None
        self._capture_into = None
        self._buffer = []

    # -- helpers ---------------------------------------------------------

    def _start_capture(self, target):
        self._capture_into = target
        self._buffer = []

    def _finish_capture(self):
        text = normalize_text("".join(self._buffer))
        self._capture_into = None
        self._buffer = []
        return text

    @property
    def _in_member(self):
        return self._member_depth is not None

    @property
    def _in_holder(self):
        return self._holder_depth is not None

    # -- HTMLParser ------------------------------------------------------

    def handle_starttag(self, tag, attrs):
        if self._done:
            return
        attrs = dict(attrs)

        if tag == "div":
            self._div_depth += 1
            if self._in_member:
                if has_class(attrs, "memberPhoto"):
                    self._current_member["photoHash"] = parse_photo_hash(
                        attrs.get("style")
                    )
            elif self._in_holder and has_class(attrs, "member"):
                self._member_depth = self._div_depth
                self._current_member = {"name": "", "titles": [], "photoHash": None}
            elif not self._in_holder and has_class(attrs, "memberHolder"):
                self._holder_depth = self._div_depth
                self._current_group = {
                    "group": self._pending_group or "",
                    "members": [],
                }
                self.groups.append(self._current_group)
            return

        if tag == "h3" and not self._in_holder:
            self._start_capture("group")
        elif tag == "h4" and self._in_member:
            self._start_capture("name")
        elif tag == "p" and self._in_member:
            self._start_capture("title")

    def handle_endtag(self, tag):
        if self._done:
            return

        if tag == "div":
            if self._in_member and self._div_depth == self._member_depth:
                # Een lid zonder naam is een leeg blokje in de opmaak.
                if self._current_member["name"]:
                    self._current_group["members"].append(self._current_member)
                self._member_depth = None
                self._current_member = None
            elif self._in_holder and self._div_depth == self._holder_depth:
                self._holder_depth = None
                self._current_group = None
            self._div_depth = max(0, self._div_depth - 1)
            return

        if tag == "h3" and self._capture_into == "group":
            heading = self._finish_capture()
            if heading.lower() in FOOTER_HEADINGS:
                self._done = True
            elif heading:
                self._pending_group = heading
        elif tag == "h4" and self._capture_into == "name":
            self._current_member["name"] = self._finish_capture()
        elif tag == "p" and self._capture_into == "title":
            # Een lid kan meerdere <p> hebben, bv. "Groepscoördinator" én een
            # echte titel. Alle waarden worden bewaard; de merge beslist.
            text = self._finish_capture() or ""
            if text:
                self._current_member["titles"].append(text)

    def handle_data(self, data):
        if self._capture_into:
            self._buffer.append(data)


def fetch(url):
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
        raw = response.read()
        charset = response.headers.get_content_charset() or "utf-8"
    return raw.decode(charset, errors="replace")


def fetch_with_retry(url):
    """Haal de pagina op; bij een fout één keer opnieuw na een korte pauze."""
    try:
        return fetch(url)
    except (urllib.error.URLError, urllib.error.HTTPError, OSError) as first_error:
        print(f"  fetch mislukt ({first_error}), opnieuw proberen...", file=sys.stderr)
        time.sleep(RETRY_PAUSE_SECONDS)
        return fetch(url)


def scrape_year(start_year):
    url = BASE_URL.format(start=start_year, end=start_year + 1)
    html = fetch_with_retry(url)
    parser = PraesidiumParser()
    parser.feed(html)
    parser.close()
    return {"year": start_year, "groups": parser.groups}


def main():
    result = {}
    failures = []

    for index, start_year in enumerate(START_YEARS):
        if index:
            time.sleep(POLITE_PAUSE_SECONDS)
        try:
            result[str(start_year)] = scrape_year(start_year)
        except Exception as error:  # noqa: BLE001 - één jaar mag de rest niet kelderen
            failures.append((start_year, error))
            print(f"{start_year}: MISLUKT ({error})", file=sys.stderr)

    OUTPUT_PATH.write_text(
        json.dumps(result, indent=1, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    for year in sorted(result):
        groups = result[year]["groups"]
        members = sum(len(group["members"]) for group in groups)
        print(f"{year}: {len(groups)} groups, {members} members")

    if failures:
        print(f"\n{len(failures)} jaar/jaren niet opgehaald:")
        for start_year, error in failures:
            print(f"  {start_year}: {error}")

    print(f"\nGeschreven: {OUTPUT_PATH}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
