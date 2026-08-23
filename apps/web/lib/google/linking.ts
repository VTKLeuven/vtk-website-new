/**
 * Voorstellen om een `@vtk.be`-account aan een website-lid te koppelen.
 *
 * Dit is de eenmalige inhaalslag voor de accounts die al bestonden. Nieuwe
 * accounts worden door de site zelf aangemaakt (dan klopt de koppeling per
 * constructie) en leden kunnen zich zelf koppelen met een Google-login; zie
 * docs/design-decisions.md.
 *
 * **We stellen enkel voor wat eenduidig is.** Twee leden die "Jan Peeters"
 * heten leveren geen voorstel op maar een rij in `ambiguous`: dan kiest een
 * mens. Een verkeerde koppeling zet iemand in de mailinglijsten van een ander
 * en is achteraf lastig te merken.
 *
 * Geen `server-only`: pure functie, getest in `test/googleLinking.test.ts`.
 */

export type WebsiteUser = {
  id: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
};

export type DirectoryUser = {
  id: string;
  primaryEmail: string;
  givenName?: string;
  familyName?: string;
  fullName?: string;
};

export type LinkSuggestion = {
  userId: string;
  userName: string;
  googleUserId: string;
  googleEmail: string;
};

export type LinkSuggestions = {
  /** Eenduidige voorstellen: precies één lid en precies één Google-account. */
  matches: LinkSuggestion[];
  /** Google-accounts met meerdere kandidaten, of leden met meerdere accounts. */
  ambiguous: { googleUserId: string; googleEmail: string; candidates: WebsiteUser[] }[];
  /** Google-accounts waar geen enkel lid bij past (oud-leden, gedeelde adressen). */
  unmatched: { googleUserId: string; googleEmail: string; label: string }[];
};

/**
 * Vergelijkbare vorm van een naam: kleine letters, accenten weg, alles wat geen
 * letter is weg, woorden gesorteerd. Zo matcht "Van den Broeck, Jan" met "Jan
 * van den Broeck" en "Noël" met "Noel".
 */
export function nameKey(...parts: (string | null | undefined)[]): string {
  return parts
    .filter(Boolean)
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

export function suggestLinks(input: {
  /** Leden zonder gekoppeld account. */
  users: WebsiteUser[];
  /** Google-accounts die nog aan geen enkel lid hangen. */
  directory: DirectoryUser[];
}): LinkSuggestions {
  const byKey = new Map<string, WebsiteUser[]>();
  for (const user of input.users) {
    const key = nameKey(user.firstName ?? "", user.lastName ?? "") || nameKey(user.name);
    if (!key) continue;
    const bucket = byKey.get(key);
    if (bucket) bucket.push(user);
    else byKey.set(key, [user]);
  }

  const matches: LinkSuggestion[] = [];
  const ambiguous: LinkSuggestions["ambiguous"] = [];
  const unmatched: LinkSuggestions["unmatched"] = [];
  // Een lid kan maar aan één account hangen. Twee Google-accounts met dezelfde
  // naam (een oud en een nieuw) mogen dus geen twee voorstellen geven.
  const claimed = new Map<string, number>();

  for (const account of input.directory) {
    const key =
      nameKey(account.givenName, account.familyName) || nameKey(account.fullName ?? "");
    const label = account.fullName ?? account.primaryEmail;
    const candidates = key ? (byKey.get(key) ?? []) : [];

    if (candidates.length === 0) {
      unmatched.push({ googleUserId: account.id, googleEmail: account.primaryEmail, label });
      continue;
    }
    if (candidates.length > 1) {
      ambiguous.push({
        googleUserId: account.id,
        googleEmail: account.primaryEmail,
        candidates,
      });
      continue;
    }
    claimed.set(key, (claimed.get(key) ?? 0) + 1);
    matches.push({
      userId: candidates[0].id,
      userName: candidates[0].name,
      googleUserId: account.id,
      googleEmail: account.primaryEmail,
    });
  }

  // Pas hier weten we welke sleutels dubbel geclaimd zijn; die voorstellen
  // gaan alsnog naar `ambiguous`, met het lid als enige kandidaat zodat het
  // scherm toont waarover het gaat.
  const contested = new Set([...claimed.entries()].filter(([, n]) => n > 1).map(([k]) => k));
  if (contested.size === 0) return { matches, ambiguous, unmatched };

  const kept: LinkSuggestion[] = [];
  for (const match of matches) {
    const user = input.users.find((u) => u.id === match.userId);
    const key = user ? nameKey(user.firstName ?? "", user.lastName ?? "") || nameKey(user.name) : "";
    if (key && contested.has(key)) {
      ambiguous.push({
        googleUserId: match.googleUserId,
        googleEmail: match.googleEmail,
        candidates: user ? [user] : [],
      });
      continue;
    }
    kept.push(match);
  }
  return { matches: kept, ambiguous, unmatched };
}
