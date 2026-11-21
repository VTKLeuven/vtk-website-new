/**
 * Sorteren in de ledenlijst en de ereledenlijst op /admin/leden, via de URL
 * (`?sorteer=naam&richting=op`), zoals de zoekterm en de soort: zo sorteert de
 * server, volgt de Excel-export dezelfde volgorde en blijft een link naar een
 * gesorteerde lijst een gesorteerde lijst.
 *
 * Bewust zonder prisma, zodat het zonder database te testen is en ook in een
 * clientcomponent gelezen mag worden.
 */

export const MEMBER_SORT_KEYS = ["naam", "rnummer", "soort", "bedrag", "datum"] as const;
export type MemberSortKey = (typeof MEMBER_SORT_KEYS)[number];
export type SortDirection = "asc" | "desc";
export type MemberSort = { key: MemberSortKey; dir: SortDirection };

/** Zonder keuze: de nieuwste leden bovenaan, zoals de lijst altijd stond. */
export const DEFAULT_MEMBER_SORT: MemberSort = { key: "datum", dir: "desc" };

/** Bij de ereleden: op naam, want een gratis erelid heeft geen datum. */
export const DEFAULT_HONORARY_SORT: MemberSort = { key: "naam", dir: "asc" };

/**
 * De richting bij een eerste klik op een kolom: tekst van A naar Z, een bedrag
 * en een datum van groot naar klein (het duurste en het nieuwste eerst).
 */
const FIRST_DIRECTION: Record<MemberSortKey, SortDirection> = {
  naam: "asc",
  rnummer: "asc",
  soort: "asc",
  bedrag: "desc",
  datum: "desc",
};

export function parseMemberSort(
  key: string | null | undefined,
  direction: string | null | undefined,
  fallback: MemberSort = DEFAULT_MEMBER_SORT,
): MemberSort {
  if (!key || !(MEMBER_SORT_KEYS as readonly string[]).includes(key)) return fallback;
  const sortKey = key as MemberSortKey;
  const dir: SortDirection =
    direction === "op" ? "asc" : direction === "af" ? "desc" : FIRST_DIRECTION[sortKey];
  return { key: sortKey, dir };
}

/** Wat een klik op de kop van een kolom wordt: omkeren als ze al actief is. */
export function nextMemberSort(current: MemberSort, key: MemberSortKey): MemberSort {
  if (current.key === key) return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  return { key, dir: FIRST_DIRECTION[key] };
}

/** De sortering als URL-parameters; de standaard van die lijst laat de URL leeg. */
export function memberSortParams(
  sort: MemberSort,
  fallback: MemberSort = DEFAULT_MEMBER_SORT,
): Record<string, string> {
  if (sort.key === fallback.key && sort.dir === fallback.dir) return {};
  return { sorteer: sort.key, richting: sort.dir === "asc" ? "op" : "af" };
}

/**
 * Vergelijkt twee waarden in een kolom. Een lege waarde (geen r-nummer, geen
 * datum) staat altijd achteraan, in welke richting ook: anders begint een
 * lijst die je op r-nummer sorteert met twintig keer "-".
 */
export function compareSortValues(
  a: string | number | null,
  b: string | number | null,
  dir: SortDirection,
): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  const order =
    typeof a === "number" && typeof b === "number"
      ? a - b
      : String(a).localeCompare(String(b), "nl-BE", { sensitivity: "base", numeric: true });
  return dir === "asc" ? order : -order;
}
