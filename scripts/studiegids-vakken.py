#!/usr/bin/env python3
"""Haalt de vakken van een programma uit de studiegids van de KU Leuven, klaar
om te plakken in "Meerdere toevoegen" op /admin/pal-plus?tab=vakken.

    python3 scripts/studiegids-vakken.py --zoek "bachelor ingenieurswetenschappen"
    python3 scripts/studiegids-vakken.py SC_57861104 --fase 1 --fase 2 > vakken.txt
    python3 scripts/studiegids-vakken.py SC_57861104 --richting werktuigkunde
    python3 scripts/studiegids-vakken.py SC_57861104 --richtingen

Een programma geef je als zijn SC-nummer of als de link uit
onderwijsaanbod.kuleuven.be; `--zoek` vindt dat nummer op naam. Geef je er
meerdere, dan staat elk vak maar één keer in de uitvoer.

De uitvoer is één vak per regel, `code<TAB>Nederlandse naam<TAB>Engelse naam`,
met `#`-regels per programma en per fase ertussen. Het plakveld slaat die
`#`-regels over en leest de tabs als kolommen, dus je kan alles in één keer
plakken. Wat al in de lijst staat, slaat het beheer over.

Bachelor ingenieurswetenschappen (Leuven):
    SC_57861104  gestart in 2024-2025 of later
    SC_55036830  gestart voor 2024-2025

Hoe het werkt: de studiegids zoekt zelf in een Elasticsearch achter
`/api/<index>/_search`, met per academiejaar een index (`pg2026`). Elk document
is een diploma met zijn programma's, en elk programma draagt zijn volledige
structuur: groepen (afstudeerrichtingen, keuzepakketten) en de vakken erin. Dat
endpoint is niet gedocumenteerd en de KU Leuven belooft er niets over; verandert
het, dan stopt dit script met een melding in plaats van een halve lijst te
geven. Welke index nu geldt, leest het van de startpagina van de studiegids,
tenzij je `--jaar` meegeeft. Enkel de standaardbibliotheek, dus geen
virtualenv nodig.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.error
import urllib.request

SITE = "https://onderwijsaanbod.kuleuven.be"
USER_AGENT = "VTK Leuven, PAL+-vakkenlijst"


def request(url: str, body: dict | None = None) -> bytes:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"User-Agent": USER_AGENT}
    if data is not None:
        headers["Content-Type"] = "application/json"
    try:
        with urllib.request.urlopen(
            urllib.request.Request(url, data=data, headers=headers), timeout=60
        ) as response:
            return response.read()
    except urllib.error.HTTPError as err:
        sys.exit(f"De studiegids antwoordde {err.code} op {url}.")
    except urllib.error.URLError as err:
        sys.exit(f"Kon {url} niet bereiken: {err.reason}.")


def search_index(year: int | None) -> str:
    """De index van het academiejaar, zoals de startpagina van de studiegids hem zelf gebruikt."""
    if year:
        return f"pg{year}"
    html = request(f"{SITE}/opleidingen/n").decode("utf-8")
    prefix = re.search(r'esindex="(\w+)"', html)
    current = re.search(r'\byear="(\d{4})"', html)
    if not prefix or not current:
        sys.exit("Kon de zoekindex niet vinden op de startpagina van de studiegids. Geef --jaar mee.")
    return prefix.group(1) + current.group(1)


def search(index: str, body: dict) -> list[dict]:
    result = json.loads(request(f"{SITE}/api/{index}/_search", body))
    try:
        return [hit["_source"] for hit in result["hits"]["hits"]]
    except (KeyError, TypeError):
        sys.exit("De studiegids gaf een onverwacht antwoord. Is het zoek-endpoint veranderd?")


def program_id(arg: str) -> str:
    match = re.search(r"(?:SC_)?(\d{8})(?:\.htm)?/?$", arg.strip(), flags=re.IGNORECASE)
    if not match:
        sys.exit(f"Geen programma: {arg!r}. Geef een SC-nummer (SC_57861104) of een link.")
    return match.group(1)


def title_in(language_set: list | None, language: str, field: str) -> str | None:
    for entry in language_set or []:
        lang = entry.get("programLangu") or entry.get("moduleGroupLangu") or entry.get("moduleLangu")
        if lang != language:
            continue
        for item in entry.get(field) or []:
            if item.get("description"):
                return " ".join(item["description"].split())
    return None


def program_title(program: dict) -> str:
    return title_in(program.get("programLanguageSet"), "NL", "programTitleSet") or f"SC_{program['programId']}"


def find_programs(index: str, text: str) -> None:
    sources = search(
        index,
        {
            "size": 50,
            "_source": [
                "programSet.programId",
                "programSet.inProgramGuide",
                "programSet.programLanguageSet",
            ],
            "query": {
                "match": {
                    "programSet.programLanguageSet.programTitleSet.description": {
                        "query": text,
                        "operator": "and",
                    }
                }
            },
        },
    )
    words = text.lower().split()
    found = {}
    for source in sources:
        for program in source.get("programSet") or []:
            title = program_title(program)
            # Een diploma kan meerdere programma's hebben; enkel die waarvan de
            # naam zelf overeenkomt, en enkel wat in de studiegids staat.
            if program.get("inProgramGuide") == "True" and all(w in title.lower() for w in words):
                found[program["programId"]] = title
    if not found:
        sys.exit(f"Geen programma gevonden voor {text!r}.")
    for pid, title in sorted(found.items(), key=lambda item: item[1]):
        print(f"SC_{pid}  {title}")


def fetch_program(index: str, pid: str) -> dict:
    sources = search(
        index,
        {
            "size": 5,
            "_source": [
                "programSet.programId",
                "programSet.programLanguageSet",
                "programSet.moduleGroupSet",
            ],
            "query": {"term": {"programSet.programId": pid}},
        },
    )
    for source in sources:
        for program in source.get("programSet") or []:
            if program.get("programId") == pid:
                return program
    sys.exit(f"SC_{pid} staat niet in de studiegids van {index}. Klopt het nummer, of het jaar?")


def courses(program: dict) -> tuple[dict[str, dict], dict[str, dict]]:
    groups: dict[str, dict] = {}
    found: dict[str, dict] = {}

    for group in program.get("moduleGroupSet") or []:
        group_id = group.get("moduleGroupId")
        groups[group_id] = {
            "title": title_in(group.get("moduleGroupLanguageSet"), "NL", "moduleGroupTitleSet"),
            "parent": group.get("parentId") if group.get("parentType") == "modulegroup" else None,
        }
        for module in group.get("moduleSet") or []:
            code = (module.get("short") or "").strip().upper()
            if not code:
                continue
            course = found.setdefault(
                code,
                {
                    "code": code,
                    "nl": title_in(module.get("moduleLanguageSet"), "NL", "moduleTitleSet"),
                    "en": title_in(module.get("moduleLanguageSet"), "EN", "moduleTitleSet"),
                    "stages": set(),
                    "groups": set(),
                },
            )
            course["stages"].add(int(module.get("stageStart") or 0))
            course["groups"].add(group_id)

    if not found:
        sys.exit(f"{program_title(program)} bevat geen vakken. Is de structuur van de studiegids veranderd?")
    return found, groups


def lineage(group_id: str | None, groups: dict[str, dict]) -> list[str]:
    titles = []
    seen = set()
    while group_id and group_id in groups and group_id not in seen:
        seen.add(group_id)
        if groups[group_id]["title"]:
            titles.append(groups[group_id]["title"])
        group_id = groups[group_id]["parent"]
    return titles


def clean(text: str | None) -> str:
    # Een tab of puntkomma in een naam zou het plakveld als kolomscheiding lezen.
    return re.sub(r"[\t;]+", ",", text or "").strip()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Vakken uit de KU Leuven-studiegids, om te plakken in PAL+.",
    )
    parser.add_argument("programma", nargs="*", help="SC-nummer of link, bv. SC_57861104")
    parser.add_argument("--zoek", metavar="NAAM", help="zoek het SC-nummer van een programma op naam")
    parser.add_argument("--jaar", type=int, help="academiejaar waarin het begint, bv. 2026 voor 2026-2027")
    parser.add_argument("--fase", type=int, action="append", help="enkel deze fase (herhaalbaar)")
    parser.add_argument(
        "--richting",
        action="append",
        help="enkel vakken onder een groep waarvan de naam dit bevat, bv. werktuigkunde (herhaalbaar)",
    )
    parser.add_argument(
        "--richtingen",
        action="store_true",
        help="toon de groepen (afstudeerrichtingen, keuzepakketten) in plaats van de vakken",
    )
    args = parser.parse_args()
    if not args.zoek and not args.programma:
        parser.error("geef een programma, of zoek er een met --zoek")

    index = search_index(args.jaar)
    if args.zoek:
        find_programs(index, args.zoek)
        return

    wanted_stages = set(args.fase or [])
    wanted_groups = [term.lower() for term in args.richting or []]
    printed: set[str] = set()
    total = 0

    for arg in args.programma:
        pid = program_id(arg)
        program = fetch_program(index, pid)
        title = program_title(program)
        found, groups = courses(program)

        if args.richtingen:
            print(f"# {title}")
            for group in sorted({g["title"] for g in groups.values() if g["title"]}):
                print(group)
            continue

        def keep(course: dict) -> bool:
            if wanted_stages and not course["stages"] & wanted_stages:
                return False
            if wanted_groups:
                names = " / ".join(
                    name for group in course["groups"] for name in lineage(group, groups)
                ).lower()
                return any(term in names for term in wanted_groups)
            return True

        def stage_of(course: dict) -> int:
            # Een vak in fase 2 en 3 staat onder de eerste fase waar je om vroeg.
            return min(course["stages"] & wanted_stages or course["stages"])

        selected = [c for c in found.values() if c["code"] not in printed and keep(c)]
        print(f"# {title}")
        print(f"# {SITE}/opleidingen/n/SC_{pid} ({index})")
        for stage in sorted({stage_of(c) for c in selected}):
            print(f"# Fase {stage}" if stage else "# Zonder fase")
            for course in sorted(
                (c for c in selected if stage_of(c) == stage),
                key=lambda c: (clean(c["nl"]) or c["code"]).lower(),
            ):
                print("\t".join([course["code"], clean(course["nl"]) or course["code"], clean(course["en"])]))
                printed.add(course["code"])
                total += 1
        print()

    if not args.richtingen:
        print(f"{total} vakken.", file=sys.stderr)
        if total == 0 and wanted_groups:
            print("Geen enkel vak gevonden. Bekijk de namen met --richtingen.", file=sys.stderr)


if __name__ == "__main__":
    main()
