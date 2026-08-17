#!/usr/bin/env python3
"""
Merge the scraped vtk.be praesidium history into the import data for the new site.

Inputs
  scripts/praesidium-history-raw.json   (produced by scripts/scrape-praesidium.py)
  scripts/praesidium-history.json       (existing import data, updated in place)

Output
  scripts/praesidium-history.json       (updated: titles + missing people/memberships)

Rules (see docs/praesidium-history-import.md)
  * Titles are taken LITERALLY from vtk.be, including capitalization
    ("Vice", "secretaris", "Vice-Praeses", "PAL - coördinator", ...).
  * "Groepscoördinator" is NOT stored as a title: it is encoded as the LEAD
    role (the new site derives the "Groepscoördinator" pin from role=LEAD).
    A member can have BOTH: a "Groepscoördinator" <p> AND a real title (the
    scrape keeps all <p> values in "titles"); the coordinator marker only
    sets the role, the other value stays the title.
  * Nicknames on the old site (2006-2009, plus the 2024-2025 joke "Vroem vroem")
    are skipped: they are not titles and are left empty.
  * The merge is additive: it never removes existing people or memberships and
    never creates a second entry for the same person. Matching is by normalized
    name: a person is matched to their existing JSON entry (litus id) if one
    exists; otherwise ONE new entry is created that collects all their years.
    For ambiguous names (two existing entries with the same name) the
    (year, group) is used to disambiguate; if that fails the data is skipped
    and reported.
  * For existing memberships a title is only ever set, never cleared.

ID scheme for new people (no litus id available)
  * vtk-<first 16 hex chars of the vtk.be member-photo hash> of the FIRST year
    they appear (stable across runs: same page, same hash). Note: a person's
    photo can differ per year on the old site; only the first-seen hash is used.
  * vtk-<slugified name> when no photo exists, suffixed with -2/-3/... on
    collision.
  This cannot collide with the litus-XXXXX ids of real members.

Usage
  python3 scripts/merge-praesidium-history.py [--dry-run] [--report]
"""

from __future__ import annotations

import json
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent
RAW_PATH = ROOT / "praesidium-history-raw.json"
DATA_PATH = ROOT / "praesidium-history.json"
PHOTO_BASE = "https://vtk.be/_common/profile/"

# Nicknames on the old site that are not titles (2006-2007..2008-2009,
# plus the 2024-2025 joke "Vroem vroem"). Normalized: lowercase, no diacritics.
NICKNAMES = {
    "timbo", "coelmoes", "vince", "freddi", "fil", "willie", "fre",
    "bonas", "adel", "jelly", "gio", "morris", "vroem vroem",
}
COORD_TITLE = "groepscoordinator"  # normalized "Groepscoördinator"

# The 14 people known to be missing from the import data (task list, minus the
# 2026-2027 current-year entry which uses real accounts). Used for the report.
MISSING_EXPECTED = [
    ("Tom Desmet", 2006, "Groep 5", "Vice"),
    ("Jeroen Frederix", 2006, "Groep 5", "secretaris"),
    ("Tim Bottelbergs", 2007, "Groep 5", "Vice"),
    ("Ralf Boelanders", 2007, "Groep 5", "secretaris"),
    ("Marline Berghmans", 2007, "Groep 5", "Beheerder"),
    ("Sam Daems", 2007, "Groep 5", "Beheerder"),
    ("Lieven Smekens", 2008, "Groep 5", "Vice"),
    ("Kjelle Apers", 2008, "Groep 5", "secretaris"),
    ("Eva Spillebeen", 2008, "Groep 5", "Beheerder"),
    ("Andries Purnal", 2008, "Groep 5", "Beheerder"),
    ("Edward Belderbos", 2009, "Groep 5", "Vice-Praeses"),
    ("Michiel Mentens", 2009, "Groep 5", "Secretaris"),
    ("Maarten Grauwels", 2009, "Groep 5", "Beheerder"),
    ("Nele Meeuwsen", 2009, "Groep 5", "Beheerder"),
]


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return " ".join(s.split())


def slugify(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s


def split_name(name: str) -> tuple[str | None, str | None]:
    parts = name.split()
    if not parts:
        return None, None
    if len(parts) == 1:
        return parts[0], None
    return parts[0], " ".join(parts[1:])


def main() -> int:
    dry = "--dry-run" in sys.argv
    want_report = "--report" in sys.argv

    raw = json.loads(RAW_PATH.read_text("utf-8"))
    data = json.loads(DATA_PATH.read_text("utf-8"))
    people = data["people"]

    # Index existing people by normalized name -> list of indices. Updated as
    # new people are added, so a person is matched by name across ALL years.
    by_name: dict[str, list[int]] = {}
    for i, p in enumerate(people):
        by_name.setdefault(norm(p["name"]), []).append(i)

    def find_existing(nname: str, year: int, group: str, report: list[str]) -> int | None:
        cands = by_name.get(nname, [])
        if len(cands) == 1:
            return cands[0]
        if len(cands) == 0:
            return None
        gnorm = norm(group)
        # Prefer the candidate that already has this exact (year, group).
        exact = [i for i in cands if any(
            m["year"] == year and norm(m["post"]) == gnorm for m in people[i]["memberships"]
        )]
        if len(exact) == 1:
            return exact[0]
        # Fall back: any membership in that year at all.
        in_year = [i for i in cands if any(m["year"] == year for m in people[i]["memberships"])]
        if len(in_year) == 1:
            return in_year[0]
        names = [people[i]["name"] for i in cands]
        report.append(
            f"AMBIGUOUS name '{people[cands[0]]['name']}' ({year} {group}): "
            f"matches {len(cands)} existing people ({', '.join(names)}) - skipped"
        )
        return None

    used_ids = {p["id"] for p in people}
    new_people: list[dict] = []
    new_by_name: dict[str, int] = {}  # normalized name -> index of a new entry
    memberships_added = 0
    titles_set = 0
    coord_to_lead = 0
    nicknames_skipped = 0
    coord_titles_skipped = 0
    role_mismatch: list[str] = []
    skipped: list[str] = []

    for year_str in sorted(raw.keys(), key=int):
        year = int(year_str)
        for group_entry in raw[year_str]["groups"]:
            group = group_entry["group"]
            for m in group_entry["members"]:
                name = m["name"]
                nname = norm(name)
                # Een lid kan meerdere <p> hebben: "Groepscoördinator" (de
                # gele pin) én een echte titel, bv. "Praeses" of "Recruitment".
                raw_titles = [t.strip() for t in m.get("titles", []) if t and t.strip()]
                is_coord = any(norm(t) == COORD_TITLE for t in raw_titles)
                real_titles = [t for t in raw_titles if norm(t) != COORD_TITLE]
                if len(real_titles) > 1:
                    skipped.append(
                        f"MULTI-TITLE {name} ({year} {group}): {real_titles} - "
                        f"first one kept as title"
                    )
                title = real_titles[0] if real_titles else None
                ntitle = norm(title) if title else None
                is_nick = ntitle in NICKNAMES

                if is_coord:
                    coord_titles_skipped += 1
                elif is_nick:
                    nicknames_skipped += 1

                # Een "Groepscoördinator" <p> zet enkel de LEAD-rol (de pin);
                # een eventuele tweede <p> is een echte titel en blijft behouden.
                derived_title = None if is_nick else title
                role = "LEAD" if is_coord else None  # None -> keep existing / default MEMBER

                idx = find_existing(nname, year, group, skipped)
                if idx is None:
                    # Nieuwe persoon: één entry per naam, ongeacht het aantal
                    # jaren/groepen op de oude site.
                    if nname in new_by_name:
                        idx = new_by_name[nname]
                    else:
                        hash_ = (m.get("photoHash") or "").strip()
                        if hash_:
                            pid = f"vtk-{hash_[:16]}"
                        else:
                            base = f"vtk-{slugify(name)}"
                            pid, n = base, 2
                            while pid in used_ids:
                                pid = f"{base}-{n}"
                                n += 1
                        used_ids.add(pid)
                        fn, ln = split_name(name)
                        person: dict = {"id": pid, "name": name}
                        if fn:
                            person["firstName"] = fn
                        if ln:
                            person["lastName"] = ln
                        if hash_:
                            person["photo"] = f"{PHOTO_BASE}{hash_}"
                        person["memberships"] = []
                        idx = len(people)
                        people.append(person)
                        new_people.append(person)
                        new_by_name[nname] = idx
                        by_name.setdefault(nname, []).append(idx)

                person = people[idx]
                mem = next(
                    (x for x in person["memberships"] if x["year"] == year and norm(x["post"]) == norm(group)),
                    None,
                )
                if mem is None:
                    entry: dict = {"post": group, "year": year}
                    if role is not None:
                        entry["role"] = role
                    if derived_title is not None:
                        entry["titleNl"] = derived_title
                    person["memberships"].append(entry)
                    memberships_added += 1
                    if role is not None:
                        coord_to_lead += 1
                    if derived_title is not None:
                        titles_set += 1
                else:
                    if derived_title is not None:
                        mem["titleNl"] = derived_title
                        titles_set += 1
                    # Only report role disagreements; keep existing roles.
                    if is_coord and mem.get("role") != "LEAD":
                        role_mismatch.append(
                            f"{name} ({year} {group}): scrape says coördinator, "
                            f"JSON role={mem.get('role', 'MEMBER')}"
                        )
                    elif not is_coord and mem.get("role") == "LEAD":
                        role_mismatch.append(
                            f"{name} ({year} {group}): JSON role=LEAD but scrape "
                            f"shows no coördinator title"
                        )

    if not dry:
        data["people"] = people
        DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", "utf-8")

    # ---- report ----
    years = sorted({m["year"] for p in people for m in p["memberships"]})
    by_year = Counter(m["year"] for p in people for m in p["memberships"])
    print(f"{'[DRY-RUN] ' if dry else ''}Merge report")
    print(f"  Years covered in JSON now: {years[0]}-{years[-1]}")
    print(f"  Memberships per year: " + ", ".join(f"{y}:{by_year.get(y, 0)}" for y in range(2006, 2026)))
    print(f"  Existing people: {len(people) - len(new_people)}  |  new people added: {len(new_people)}")
    print(f"  Memberships added: {memberships_added}  |  titles set: {titles_set}")
    print(f"  'Groepscoördinator' titles skipped (-> LEAD role): {coord_titles_skipped} "
          f"(new LEADs: {coord_to_lead})")
    print(f"  Nicknames skipped: {nicknames_skipped}")
    if role_mismatch:
        print(f"  Role mismatches (existing JSON vs scrape): {len(role_mismatch)}")
        for r in role_mismatch[:20]:
            print(f"    ! {r}")
    if skipped:
        print(f"  Skipped (ambiguous/multi-title): {len(skipped)}")
        for s in skipped[:10]:
            print(f"    - {s}")

    # Expected missing people present?
    idx = {norm(p["name"]): p for p in people}
    print("  Expected missing people:")
    for name, year, group, title in MISSING_EXPECTED:
        p = idx.get(norm(name))
        if p is None:
            print(f"    !! {name} ({year} {group}): NOT FOUND")
            continue
        mem = next((x for x in p["memberships"] if x["year"] == year and norm(x["post"]) == norm(group)), None)
        if mem is None:
            print(f"    !! {name} ({year} {group}): person exists but membership missing")
            continue
        ok = mem.get("titleNl") == title
        print(f"    {'OK ' if ok else '??'} {name} ({year} {group}): titleNl={mem.get('titleNl')!r} "
              f"({'match' if ok else 'EXPECTED ' + repr(title)})")

    # Sanity: no forbidden titles in the output.
    bad = []
    for p in people:
        for m in p["memberships"]:
            t = m.get("titleNl")
            if t and (norm(t) in NICKNAMES or norm(t) == COORD_TITLE):
                bad.append(f"{p['name']} ({m['year']} {m['post']}): {t!r}")
    print(f"  Forbidden titles (nicknames/coordinator) still present: {len(bad)}")
    for b in bad[:10]:
        print(f"    ! {b}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
