/**
 * Accounts terugzetten in hun organisatie-eenheid, uit het logboek van de
 * Admin console.
 *
 * Op 16 november 2026 verhuisde de sync tientallen accounts uit /Praesidium,
 * /Statix, /Oude Zakken enz. naar "/" (zie docs/google-workspace.md, "Vallen").
 * De site wist niet waar ze stonden; het logboek wel: "x@vtk.be is verplaatst
 * van /Praesidium naar /". Dit leest die regels, zoals ze uit de tabel gekopieerd
 * of als CSV geëxporteerd worden.
 *
 * Geen `server-only`: puur, zie `test/googleOuRestore.test.ts`.
 */

export type OuMove = { email: string; from: string; to: string; at: string | null };

const MOVE =
  /([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})\s+(?:is verplaatst van|was moved from|moved from)\s+(\/[^\t"\n,]*?)\s+(?:naar|to)\s+(\/[^\t"\n,]*?)\s*(?=[\t",\n]|$)/g;
const ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})/;

/** Elke verhuizing in de geplakte tekst, met het tijdstip als het op dezelfde regel staat. */
export function parseOuMoves(text: string): OuMove[] {
  const out: OuMove[] = [];
  for (const line of text.split(/\r?\n/)) {
    const at = line.match(ISO)?.[0] ?? null;
    for (const m of line.matchAll(MOVE)) {
      out.push({ email: m[1].toLowerCase(), from: m[2].trim(), to: m[3].trim(), at });
    }
  }
  return out;
}

export type OuPlan = {
  email: string;
  /** Waar het account stond voor de eerste verhuizing in de tekst. */
  restoreTo: string;
  /** Waar de laatste verhuizing in de tekst het zette. Staat het daar nog, dan zetten we het terug. */
  movedTo: string;
};

/**
 * Per account: de oudste "van" en de jongste "naar". Zonder tijdstippen geldt
 * de volgorde van het logboek, en dat toont het nieuwste bovenaan.
 */
export function planOuRestore(moves: OuMove[]): OuPlan[] {
  const byEmail = new Map<string, OuMove[]>();
  moves.forEach((move, index) => {
    const list = byEmail.get(move.email) ?? [];
    // Zonder tijdstip: hoe lager in de tekst, hoe ouder.
    list.push({ ...move, at: move.at ?? `~${String(moves.length - index).padStart(8, "0")}` });
    byEmail.set(move.email, list);
  });
  const plans: OuPlan[] = [];
  for (const [email, list] of byEmail) {
    const sorted = [...list].sort((a, b) => order(a.at) - order(b.at) || compare(a.at, b.at));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    if (first.from === last.to) continue; // Al terug waar het stond.
    plans.push({ email, restoreTo: first.from, movedTo: last.to });
  }
  return plans.sort((a, b) => a.email.localeCompare(b.email));
}

// Echte tijdstippen en volgnummers niet door elkaar vergelijken: wie allebei
// mengt (een deel met en een deel zonder datum), krijgt de datums eerst.
function order(at: string | null): number {
  return at?.startsWith("~") ? 1 : 0;
}
function compare(a: string | null, b: string | null): number {
  if (a?.startsWith("~") || b?.startsWith("~")) return (a ?? "").localeCompare(b ?? "");
  return new Date(a ?? 0).getTime() - new Date(b ?? 0).getTime();
}
