/**
 * Wanneer de gele strook bovenaan de site verschijnt, en voor wie.
 *
 * Puur en zonder imports uit `@vtk/i18n`: dit bestand zit in de bundel van elke
 * pagina, want de strook hangt in de layout.
 */

/** Het anker van de vragen in de POC-band op de homepage. */
export const POLL_ANCHOR = "peiling";

/** Wie de strook wegklikte; de server leest dit, zodat ze niet even opflikkert. */
export const POLL_STRIP_COOKIE = "vtk-peiling-verborgen";

/** Lang genoeg om elke peiling te overleven. */
export const POLL_STRIP_COOKIE_MAX_AGE = 60 * 60 * 24 * 60;

const MAX_HIDDEN_POLLS = 8;

/**
 * Hier hoort geen oproep te staan: wie afrekent, tickets scant of nog bezig is
 * met aanmelden of de onboarding, is met iets anders bezig.
 */
const EXCLUDED_PREFIXES = [
  "/admin",
  "/scan",
  "/tickets/bestelling",
  "/inloggen",
  "/registreren",
  "/onboarding",
  "/studie-bevestigen",
  "/koppel-vtk-account",
  "/wachtwoord-vergeten",
];

/**
 * `site` is de strook van een student met een open peiling. `home` is de
 * algemene strook voor wie we nog niet aan een richting kunnen koppelen: die
 * staat enkel op de homepage, want op elke pagina zou ze ook ouders en bedrijven
 * lastigvallen.
 */
export type PollStripScope = "site" | "home";

export type PollStripKind = "poll" | "signIn" | "noProgramme";

/** Het pad zonder taalvoorvoegsel en zonder afsluitende slash; de homepage is `""`. */
export function pollStripPath(pathname: string): string {
  const path = (pathname || "/").split(/[?#]/)[0].replace(/^\/(nl|en)(?=\/|$)/, "");
  const trimmed = path.replace(/\/+$/, "");
  return trimmed;
}

export function isPollHomePath(pathname: string): boolean {
  return pollStripPath(pathname) === "";
}

/**
 * Staat in de client en niet op de server: de layout hertekent niet bij een
 * navigatie binnen de site, dus wat de server bij het eerste verzoek over het
 * pad wist, klopt na de eerste klik niet meer.
 */
export function pollStripFits(scope: PollStripScope, pathname: string): boolean {
  const path = pollStripPath(pathname);
  if (EXCLUDED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return false;
  }
  return scope === "site" || path === "";
}

export function parseHiddenPolls(value: string | null | undefined): string[] {
  if (!value) return [];
  return value.split(",").filter((id) => /^[a-zA-Z0-9_-]{1,64}$/.test(id));
}

/** De nieuwe waarde van het cookie, met de recentste vooraan. */
export function addHiddenPoll(value: string | null | undefined, pollId: string): string {
  const others = parseHiddenPolls(value).filter((id) => id !== pollId);
  return [pollId, ...others].slice(0, MAX_HIDDEN_POLLS).join(",");
}

export type PollStripDecision<Poll> =
  | { kind: "poll"; poll: Poll }
  | { kind: "signIn" | "noProgramme"; pollId: string }
  | null;

/** Welke strook deze bezoeker krijgt, als er al een is. */
export function decidePollStrip<Poll extends { id: string; answered: boolean }>(input: {
  signedIn: boolean;
  programmeCount: number;
  openPollIds: readonly string[];
  viewerPolls: readonly Poll[];
  hiddenPollIds: readonly string[];
}): PollStripDecision<Poll> {
  const { signedIn, programmeCount, openPollIds, viewerPolls, hiddenPollIds } = input;
  const visible = (id: string) => !hiddenPollIds.includes(id);

  if (signedIn && programmeCount > 0) {
    const poll = viewerPolls.find((candidate) => !candidate.answered && visible(candidate.id));
    return poll ? { kind: "poll", poll } : null;
  }

  const pollId = openPollIds.find(visible);
  if (!pollId) return null;
  return { kind: signedIn ? "noProgramme" : "signIn", pollId };
}
