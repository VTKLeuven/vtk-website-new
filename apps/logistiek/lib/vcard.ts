/**
 * De gedeelde gsm-lijst van het praesidium inlezen (F4.3).
 *
 * Het team houdt de nummers bij als contactenexport (`.vcf`) en typte ze tot nu
 * met de hand over in het chauffeursbeheer. Dit bestand doet het lezen, het
 * opkuisen en het koppelen; het schrijven gebeurt elders, ná een nakijklijst.
 *
 * **Pure functies en geen databank**, om dezelfde reden als `availability-day.ts`:
 * dit is het stuk waar stil iets fout kan gaan. Een nummer dat verkeerd
 * genormaliseerd wordt, ziet er nog altijd uit als een nummer, en een naam die
 * op de verkeerde persoon valt, geeft de chauffeur van zaterdag het nummer van
 * iemand anders. Allebei merk je pas wanneer er iemand belt.
 */

/** Eén contact uit het bestand: wat erin stond, nog niet opgekuist. */
export type VcardContact = {
  /** `FN` als die er is, anders opgebouwd uit `N`. */
  name: string;
  /** Het eerste `TEL`-veld, ruw. */
  phone: string;
};

/**
 * Gevouwen regels weer aan elkaar plakken.
 *
 * RFC 6350 knipt een lange regel af en laat de rest beginnen met een spatie of
 * een tab. Dit bestand doet het niet (macOS exporteert kort), maar de volgende
 * export van een andere telefoon wel, en dan zou een naam halverwege afbreken.
 * CRLF hoort bij het formaat; een export die met LF aankomt, lezen we ook.
 */
function unfold(text: string): string[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const out: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length > 0) {
      out[out.length - 1] += line.slice(1);
      continue;
    }
    out.push(line);
  }
  return out;
}

/** De waarde van een vCard-regel: alles na de eerste dubbele punt. */
function valueOf(line: string): string {
  const at = line.indexOf(':');
  return at === -1 ? '' : line.slice(at + 1).trim();
}

/** De naam van een vCard-regel, zonder parameters: `TEL;type=CELL` wordt `TEL`. */
function fieldOf(line: string): string {
  const at = line.indexOf(':');
  const head = at === -1 ? line : line.slice(0, at);
  return head.split(';')[0].trim().toUpperCase();
}

/**
 * De contacten uit een `.vcf`.
 *
 * Eén nummer per contact: het eerste `TEL`. Wie er twee heeft staan, krijgt het
 * bovenste, en dat is beter dan raden welke van de twee de gsm is. Een contact
 * zonder naam of zonder nummer valt weg; daar is niets mee te koppelen.
 */
export function parseVcards(text: string): VcardContact[] {
  const out: VcardContact[] = [];
  let fn = '';
  let structured = '';
  let tel = '';
  let inside = false;

  for (const line of unfold(text)) {
    const field = fieldOf(line);
    if (field === 'BEGIN' && valueOf(line).toUpperCase() === 'VCARD') {
      inside = true;
      fn = '';
      structured = '';
      tel = '';
      continue;
    }
    if (!inside) continue;
    if (field === 'END' && valueOf(line).toUpperCase() === 'VCARD') {
      // `N` is `Achternaam;Voornaam;tussenvoegsel;titel;suffix`. We bouwen er
      // "Voornaam Achternaam" van, want dat is hoe een lid op de site heet.
      const parts = structured.split(';');
      const fallback = [parts[1], parts[0]].map((part) => part?.trim()).filter(Boolean).join(' ');
      const name = fn || fallback;
      if (name && tel) out.push({ name, phone: tel });
      inside = false;
      continue;
    }
    if (field === 'FN' && !fn) fn = valueOf(line);
    else if (field === 'N' && !structured) structured = valueOf(line);
    else if (field === 'TEL' && !tel) tel = valueOf(line);
  }

  return out;
}

/** Waarom een nummer niet door de normalisatie kwam. */
export type PhoneProblem = 'leeg' | 'geen-belgisch-nummer' | 'dubbele-nul';

/** Wat er van een nummer te maken viel. */
export type PhoneResult = { ok: true; phone: string } | { ok: false; reason: PhoneProblem };

/**
 * Een nummer uit de lijst naar de vorm die op het scherm komt.
 *
 * De lijst staat in `0032` plus negen cijfers; op de site staan nummers zoals het
 * lid ze zelf intikte, meestal `0470 12 34 56`. Die nationale vorm is wat iemand
 * herkent als hij hem naast zijn eigen contacten ziet, dus daar gaan we naartoe.
 *
 * **Een nummer dat niet klopt, komt er niet door.** In de lijst van september 2026
 * staat er één als `0032` plus de nationale nul (`0032057...`): iemand plakte het
 * landnummer voor een nummer dat al met een nul begon. Dat is geen vorm die we
 * mogen gokken, want `+3257...` en `057...` zijn twee verschillende nummers en
 * enkel de eigenaar weet welk van de twee hij bedoelde.
 */
export function normaliseBelgianPhone(raw: string): PhoneResult {
  const digits = raw.replace(/[^\d+]/g, '');
  if (!digits) return { ok: false, reason: 'leeg' };

  let national: string;
  if (digits.startsWith('+32')) national = `0${digits.slice(3)}`;
  else if (digits.startsWith('0032')) national = `0${digits.slice(4)}`;
  else if (digits.startsWith('32') && digits.length === 11) national = `0${digits.slice(2)}`;
  else national = digits;

  if (!national.startsWith('0')) return { ok: false, reason: 'geen-belgisch-nummer' };
  // `0032` gevolgd door een nummer dat zelf al met een nul begon.
  if (national.startsWith('00')) return { ok: false, reason: 'dubbele-nul' };

  const rest = national.slice(1);
  if (!/^\d+$/.test(rest)) return { ok: false, reason: 'geen-belgisch-nummer' };

  // Een Belgisch nummer heeft een vaste lengte: een gsm is `04` plus acht
  // cijfers, een vaste lijn `0` plus acht. Alles daarbuiten is geen Belgisch
  // nummer, en dat is geen muggenzifterij: in de lijst van september 2026 staat
  // er één als `0032` plus negen cijfers met een vaste-lijnzone (`+3257…`). Dat
  // ziet er na het omrekenen uit als een keurig `057…`-nummer met één cijfer te
  // veel, en precies zo glipt het ongemerkt in de databank.
  if (/^4\d{8}$/.test(rest)) {
    return { ok: true, phone: `0${rest.slice(0, 3)} ${rest.slice(3, 5)} ${rest.slice(5, 7)} ${rest.slice(7, 9)}` };
  }
  // Vaste lijn: we groeperen niet, want de zone is twee of drie cijfers lang en
  // een verkeerde groepering leest als een ander nummer.
  if (/^\d{8}$/.test(rest)) return { ok: true, phone: national };
  return { ok: false, reason: 'geen-belgisch-nummer' };
}

/** Een naam zonder accenten, leestekens en hoofdletters. */
export function normaliseName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]+/g, ' ')
    .trim();
}

/** Dezelfde naam met de delen gesorteerd, zodat "Jansen Wout" op "Wout Jansen" valt. */
function sortedName(value: string): string {
  return normaliseName(value).split(' ').sort().join(' ');
}

export type Person = { id: string; name: string };

export type Match<T extends Person> = {
  contact: VcardContact;
  person: T;
  /** Op de volledige naam, of pas na het sorteren van de naamdelen. */
  how: 'naam' | 'omgedraaide-naam';
  phone: string;
};

export type MatchResult<T extends Person> = {
  matched: Match<T>[];
  /** Meer dan één persoon met deze naam: daar kiezen we niet voor het team. */
  ambiguous: Array<{ contact: VcardContact; candidates: T[] }>;
  /** Geen persoon met deze naam. */
  unmatched: VcardContact[];
  /** Wel een persoon, maar het nummer was niet te lezen. */
  badPhone: Array<{ contact: VcardContact; person: T; reason: PhoneProblem }>;
};

/**
 * De contacten naast de mensen leggen.
 *
 * Twee pogingen en geen derde: exact op de genormaliseerde naam, en daarna op de
 * gesorteerde naamdelen. **Nooit op een deel van een naam.** Twee leden die
 * Wouter heten, zijn twee leden, en een chauffeur die het nummer van een andere
 * Wouter krijgt, merkt dat pas wanneer er zaterdag niemand opneemt. Wat niet
 * koppelt, komt in `unmatched` en dat is een resultaat, geen fout.
 */
export function matchContacts<T extends Person>(
  contacts: readonly VcardContact[],
  people: readonly T[]
): MatchResult<T> {
  const byName = new Map<string, T[]>();
  const bySorted = new Map<string, T[]>();
  for (const person of people) {
    const exact = normaliseName(person.name);
    const flipped = sortedName(person.name);
    byName.set(exact, [...(byName.get(exact) ?? []), person]);
    bySorted.set(flipped, [...(bySorted.get(flipped) ?? []), person]);
  }

  const result: MatchResult<T> = { matched: [], ambiguous: [], unmatched: [], badPhone: [] };

  for (const contact of contacts) {
    const exact = byName.get(normaliseName(contact.name)) ?? [];
    const flipped = bySorted.get(sortedName(contact.name)) ?? [];
    const how = exact.length > 0 ? ('naam' as const) : ('omgedraaide-naam' as const);
    const candidates = exact.length > 0 ? exact : flipped;

    if (candidates.length === 0) {
      result.unmatched.push(contact);
      continue;
    }
    if (candidates.length > 1) {
      result.ambiguous.push({ contact, candidates });
      continue;
    }

    const phone = normaliseBelgianPhone(contact.phone);
    if (!phone.ok) {
      result.badPhone.push({ contact, person: candidates[0], reason: phone.reason });
      continue;
    }
    result.matched.push({ contact, person: candidates[0], how, phone: phone.phone });
  }

  return result;
}
