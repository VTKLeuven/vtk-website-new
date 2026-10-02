/**
 * De groepjesmaker: pure indeling, zonder database. `run.ts` laadt de
 * inzendingen en bewaart het resultaat; alles wat beslist, staat hier en is
 * zonder Prisma te testen.
 *
 * Het werkt in drie stappen:
 *
 * 1. **Blokken.** Een inzending is één blok, met als gewicht het aantal personen
 *    waarmee ze zich inschreef. Een partnerverwijzing voegt twee blokken samen;
 *    een blok wordt nooit gesplitst.
 * 2. **Beginindeling.** Het aantal groepen volgt uit de grenzen. De kern (peters
 *    en meters) wordt eerst verdeeld: elke kerngroep die zich samen inschreef,
 *    krijgt haar eigen groep. Daarna vullen de gewone leden eerst elke groep tot
 *    het minimum en de rest waar ze het best passen.
 * 3. **Verbeteren.** Blokken verplaatsen en wisselen zolang de indeling beter
 *    wordt. "Beter" is eerst: minder buiten de grenzen, en pas dan: meer gelijke
 *    antwoorden (SIMILAR) en minder dubbele (DIVERSE) binnen een groep.
 *
 * Dat gebeurt een paar keer met een andere volgorde; de beste indeling wint. De
 * volgorde hangt aan een vaste seed, zodat dezelfde inzendingen dezelfde
 * groepen geven.
 */

export type GroupingRole =
  | "NAME"
  | "IDENTIFIER"
  | "GROUP_SIZE"
  | "GROUP_NAMES"
  | "PARTNER"
  | "ANCHOR"
  | "ACCEPTS_EXTRA"
  | "SIMILAR"
  | "DIVERSE";

/** Hoe een antwoord vergeleken wordt; volgt uit het veldtype. */
export type GroupingValueKind = "choice" | "multi" | "number" | "boolean" | "text";

export type GroupingFieldSpec = {
  fieldId: string;
  role: GroupingRole;
  kind: GroupingValueKind;
  /** 1 tot 5; enkel voor SIMILAR en DIVERSE. */
  weight: number;
  /** Bij ANCHOR en ACCEPTS_EXTRA: de antwoorden die "ja" betekenen. */
  options: readonly string[];
};

export type GroupingAnswer = {
  text?: string | null;
  number?: number | null;
  bool?: boolean | null;
  options?: readonly string[];
};

export type GroupingEntryInput = {
  id: string;
  answers: Readonly<Record<string, GroupingAnswer | undefined>>;
};

export type GroupingParams = {
  minMembers: number;
  maxMembers: number;
  minGroups?: number | null;
  maxGroups?: number | null;
  minAnchors?: number | null;
  maxAnchors?: number | null;
};

export type GroupingWarningCode =
  | "NO_ENTRIES"
  | "PARTNER_NOT_FOUND"
  | "PARTNER_AMBIGUOUS"
  | "PARTNER_OTHER_ROLE"
  | "PARTNER_TOO_LARGE"
  | "SIZE_INFEASIBLE"
  | "GROUP_BOUNDS_CONFLICT"
  | "TOO_MANY_ANCHOR_TEAMS"
  | "GROUP_TOO_SMALL"
  | "GROUP_TOO_LARGE"
  | "ANCHORS_TOO_FEW"
  | "ANCHORS_TOO_MANY";

export type GroupingWarning = {
  code: GroupingWarningCode;
  /** De betrokken inzending, wanneer het over één inzending gaat. */
  entryId?: string;
  /** Het groepsnummer (vanaf 1), wanneer het over één groep gaat. */
  group?: number;
  /** Vrije tekst: de verwijzing die niet gevonden werd, een aantal. */
  detail?: string;
};

export type GroupingResult = {
  groups: { members: { entryId: string; isAnchor: boolean }[] }[];
  warnings: GroupingWarning[];
};

/** Hoeveel personen één inzending hoogstens kan vertegenwoordigen. */
export const MAX_REGISTRATION_SIZE = 50;

// ---------------------------------------------------------------------------
// Antwoorden lezen

/** Kleine letters, zonder accenten en met enkele spaties; om namen te vergelijken. */
export function normalizeKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9@.]+/g, " ")
    .trim();
}

/** "Jan Peeters" en "peeters jan" zijn dezelfde verwijzing. */
function tokenKey(value: string): string {
  return normalizeKey(value).split(" ").filter(Boolean).sort().join(" ");
}

/** Komma's, puntkomma's, "en"/"and" en nieuwe regels scheiden namen. */
export function splitNames(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[,;\n/]+|\s+(?:en|and|&)\s+/i)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function textOf(answer: GroupingAnswer | undefined): string | null {
  if (!answer) return null;
  if (answer.text != null && answer.text.trim()) return answer.text.trim();
  if (answer.options && answer.options.length > 0) return answer.options.join(", ");
  if (answer.number != null) return String(answer.number);
  return null;
}

/** Valt het antwoord onder een van de "ja"-opties van een ANCHOR/ACCEPTS_EXTRA-veld? */
function matchesOptions(answer: GroupingAnswer | undefined, options: readonly string[]): boolean {
  if (!answer) return false;
  if (answer.bool != null) return options.includes(answer.bool ? "true" : "false");
  if (answer.options && answer.options.some((option) => options.includes(option))) return true;
  return answer.text != null && options.includes(answer.text);
}

type Entry = {
  id: string;
  size: number;
  isAnchor: boolean;
  acceptsExtra: boolean;
  keys: Set<string>;
  partnerRefs: string[];
};

function readEntry(input: GroupingEntryInput, fields: readonly GroupingFieldSpec[]): Entry {
  let declaredSize: number | null = null;
  let extraNames = 0;
  let isAnchor = false;
  let acceptsExtra = true;
  const keys = new Set<string>();
  const partnerRefs: string[] = [];

  for (const field of fields) {
    const answer = input.answers[field.fieldId];
    switch (field.role) {
      case "NAME":
      case "IDENTIFIER": {
        const text = textOf(answer);
        if (text) {
          keys.add(normalizeKey(text));
          keys.add(tokenKey(text));
        }
        break;
      }
      case "GROUP_SIZE": {
        const raw = answer?.number ?? (answer?.text ? Number(answer.text) : null);
        if (raw != null && Number.isFinite(raw)) {
          declaredSize = Math.min(MAX_REGISTRATION_SIZE, Math.max(1, Math.round(raw)));
        }
        break;
      }
      case "GROUP_NAMES": {
        const names = splitNames(textOf(answer));
        extraNames += names.length;
        // Wie in die opsomming staat, is via deze inzending ingeschreven: een
        // partnerverwijzing naar die naam komt dus hier uit.
        for (const name of names) {
          keys.add(normalizeKey(name));
          keys.add(tokenKey(name));
        }
        break;
      }
      case "PARTNER":
        partnerRefs.push(...splitNames(textOf(answer)));
        break;
      case "ANCHOR":
        if (matchesOptions(answer, field.options)) isAnchor = true;
        break;
      case "ACCEPTS_EXTRA":
        // Enkel een expliciet "nee" sluit de groep af; niet antwoorden is geen nee.
        if (answer && !matchesOptions(answer, field.options) && hasAnyValue(answer)) {
          acceptsExtra = false;
        }
        break;
      case "SIMILAR":
      case "DIVERSE":
        break;
    }
  }

  keys.delete("");
  // Het opgegeven aantal wint; zonder aantal telt de invuller plus de namen.
  const size = declaredSize ?? Math.min(MAX_REGISTRATION_SIZE, 1 + extraNames);
  return { id: input.id, size, isAnchor, acceptsExtra, keys, partnerRefs };
}

function hasAnyValue(answer: GroupingAnswer): boolean {
  return (
    answer.bool != null ||
    answer.number != null ||
    (answer.options?.length ?? 0) > 0 ||
    Boolean(answer.text?.trim())
  );
}

// ---------------------------------------------------------------------------
// Gelijkenis tussen twee inzendingen

type Scorer = (a: GroupingEntryInput, b: GroupingEntryInput) => number;

function numberOf(answer: GroupingAnswer | undefined): number | null {
  if (!answer) return null;
  if (answer.number != null && Number.isFinite(answer.number)) return answer.number;
  return null;
}

function singleOf(answer: GroupingAnswer | undefined, kind: GroupingValueKind): string | null {
  if (!answer) return null;
  if (kind === "boolean") return answer.bool == null ? null : String(answer.bool);
  if (kind === "text") return answer.text?.trim() ? normalizeKey(answer.text) : null;
  if (kind === "number") return answer.number == null ? null : String(answer.number);
  return answer.options?.[0] ?? null;
}

/**
 * 0 tot 1: hoe gelijk twee antwoorden zijn. Niet beantwoord is 0, zodat een
 * leeg veld nooit twee mensen samen- of uit elkaar trekt.
 */
function sameness(field: GroupingFieldSpec, entries: readonly GroupingEntryInput[]): Scorer {
  if (field.kind === "multi") {
    return (a, b) => {
      const left = a.answers[field.fieldId]?.options ?? [];
      const right = b.answers[field.fieldId]?.options ?? [];
      if (left.length === 0 || right.length === 0) return 0;
      const rightSet = new Set(right);
      const shared = left.filter((option) => rightSet.has(option)).length;
      return shared / (left.length + right.length - shared);
    };
  }
  if (field.kind === "number" && field.role === "SIMILAR") {
    // Een schaal van 1 tot 5: 4 en 5 lijken meer op elkaar dan 1 en 5.
    const values = entries
      .map((entry) => numberOf(entry.answers[field.fieldId]))
      .filter((value): value is number => value != null);
    const range = values.length > 0 ? Math.max(...values) - Math.min(...values) : 0;
    return (a, b) => {
      const left = numberOf(a.answers[field.fieldId]);
      const right = numberOf(b.answers[field.fieldId]);
      if (left == null || right == null) return 0;
      if (range === 0) return 1;
      return 1 - Math.abs(left - right) / range;
    };
  }
  return (a, b) => {
    const left = singleOf(a.answers[field.fieldId], field.kind);
    const right = singleOf(b.answers[field.fieldId], field.kind);
    return left != null && left === right ? 1 : 0;
  };
}

/** Positief: liefst samen; negatief: liefst apart. */
function pairScorer(
  fields: readonly GroupingFieldSpec[],
  entries: readonly GroupingEntryInput[]
): Scorer {
  const parts = fields
    .filter((field) => field.role === "SIMILAR" || field.role === "DIVERSE")
    .map((field) => ({
      sign: field.role === "SIMILAR" ? 1 : -1,
      weight: Math.max(1, Math.min(5, field.weight)),
      score: sameness(field, entries),
    }));
  return (a, b) => {
    let total = 0;
    for (const part of parts) total += part.sign * part.weight * part.score(a, b);
    return total;
  };
}

// ---------------------------------------------------------------------------
// Blokken: inzendingen die samen moeten blijven

type Block = {
  entryIds: string[];
  size: number;
  isAnchor: boolean;
  acceptsExtra: boolean;
  /** Een kerngroep die zich samen inschreef: krijgt haar eigen groep. */
  isTeam: boolean;
};

function buildBlocks(
  entries: readonly Entry[],
  maxBlockSize: number,
  warnings: GroupingWarning[]
): Block[] {
  const parent = entries.map((_, index) => index);
  const size = entries.map((entry) => entry.size);
  function find(index: number): number {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  }

  const byKey = new Map<string, number[]>();
  entries.forEach((entry, index) => {
    for (const key of entry.keys) {
      const list = byKey.get(key);
      if (list) list.push(index);
      else byKey.set(key, [index]);
    }
  });

  entries.forEach((entry, index) => {
    for (const ref of entry.partnerRefs) {
      const candidates = new Set([
        ...(byKey.get(normalizeKey(ref)) ?? []),
        ...(byKey.get(tokenKey(ref)) ?? []),
      ]);
      candidates.delete(index);
      if (candidates.size === 0) {
        // Iemand die de invuller zelf al in zijn groepsinschrijving opsomde, of
        // die (nog) niet inschreef.
        if (!entry.keys.has(normalizeKey(ref)) && !entry.keys.has(tokenKey(ref))) {
          warnings.push({ code: "PARTNER_NOT_FOUND", entryId: entry.id, detail: ref });
        }
        continue;
      }
      if (candidates.size > 1) {
        warnings.push({ code: "PARTNER_AMBIGUOUS", entryId: entry.id, detail: ref });
        continue;
      }
      const other = [...candidates][0];
      if (entries[other].isAnchor !== entry.isAnchor) {
        warnings.push({ code: "PARTNER_OTHER_ROLE", entryId: entry.id, detail: ref });
        continue;
      }
      const left = find(index);
      const right = find(other);
      if (left === right) continue;
      if (size[left] + size[right] > maxBlockSize) {
        warnings.push({ code: "PARTNER_TOO_LARGE", entryId: entry.id, detail: ref });
        continue;
      }
      parent[right] = left;
      size[left] += size[right];
    }
  });

  const blocks = new Map<number, Block>();
  entries.forEach((entry, index) => {
    const root = find(index);
    const block = blocks.get(root);
    if (block) {
      block.entryIds.push(entry.id);
      block.size += entry.size;
      block.acceptsExtra &&= entry.acceptsExtra;
    } else {
      blocks.set(root, {
        entryIds: [entry.id],
        size: entry.size,
        isAnchor: entry.isAnchor,
        acceptsExtra: entry.acceptsExtra,
        isTeam: false,
      });
    }
  });
  const list = [...blocks.values()];
  for (const block of list) block.isTeam = block.isAnchor && block.size >= 2;
  return list;
}

// ---------------------------------------------------------------------------
// Aantal groepen

function chooseGroupCount(
  memberPeople: number,
  anchorPeople: number,
  teams: number,
  params: GroupingParams,
  warnings: GroupingWarning[]
): number {
  const minMembers = Math.max(0, params.minMembers);
  const maxMembers = Math.max(1, params.maxMembers);
  let low = Math.max(1, Math.ceil(memberPeople / maxMembers));
  let high = minMembers > 0 ? Math.floor(memberPeople / minMembers) : Number.POSITIVE_INFINITY;
  if (memberPeople === 0) {
    // Enkel kern: de kern zelf bepaalt het aantal.
    low = 1;
    high = Number.POSITIVE_INFINITY;
  } else if (high < low) {
    warnings.push({ code: "SIZE_INFEASIBLE", detail: String(memberPeople) });
    high = low;
  }

  const middle = (minMembers + maxMembers) / 2;
  let count =
    memberPeople > 0 ? Math.round(memberPeople / Math.max(1, middle)) : Math.max(1, teams);
  count = Math.min(high, Math.max(low, count));

  if (params.minGroups != null && count < params.minGroups) {
    if (params.minGroups > high) warnings.push({ code: "GROUP_BOUNDS_CONFLICT" });
    count = params.minGroups;
  }
  if (params.maxGroups != null && count > params.maxGroups) {
    if (params.maxGroups < low) warnings.push({ code: "GROUP_BOUNDS_CONFLICT" });
    count = params.maxGroups;
  }

  // Elke kerngroep krijgt haar eigen groep; dat gaat voor op het gewenste aantal.
  if (teams > count) {
    warnings.push({ code: "TOO_MANY_ANCHOR_TEAMS", detail: String(teams) });
    count = teams;
  }
  // Met een minimum aan kern per groep kunnen er niet meer groepen zijn dan de
  // kern kan dragen, tenzij de ledengrenzen dat afdwingen.
  if (anchorPeople > 0 && params.minAnchors != null && params.minAnchors > 0) {
    const carried = Math.max(1, Math.floor(anchorPeople / params.minAnchors));
    if (count > carried) count = Math.max(low, carried, teams);
  }
  return Math.max(1, count);
}

// ---------------------------------------------------------------------------
// Toevalsgenerator met seed (mulberry32), zodat dezelfde invoer dezelfde groepen geeft

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: readonly T[], next: () => number): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(next() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}

// ---------------------------------------------------------------------------
// Eén poging

type Attempt = { groupOf: number[]; violation: number; score: number };

function outside(count: number, min: number | null | undefined, max: number | null | undefined): number {
  let result = 0;
  if (min != null && count < min) result += min - count;
  if (max != null && count > max) result += count - max;
  return result;
}

function attempt(
  blocks: readonly Block[],
  weight: readonly Float64Array[],
  groupCount: number,
  params: GroupingParams,
  seed: number
): Attempt {
  const next = random(seed);
  const hasAnchors = blocks.some((block) => block.isAnchor);
  const anchorMin = hasAnchors ? params.minAnchors : null;
  const anchorMax = hasAnchors ? params.maxAnchors : null;

  const groupOf = new Array<number>(blocks.length).fill(-1);
  const members = new Array<number>(groupCount).fill(0);
  const anchors = new Array<number>(groupCount).fill(0);
  /** Of de groep nog kern van buitenaf aanneemt; een gesloten kerngroep niet. */
  const open = new Array<boolean>(groupCount).fill(true);
  /** Blokken die niet mogen bewegen: de kerngroepen die hun groep dragen. */
  const fixed = new Array<boolean>(blocks.length).fill(false);
  const affinity = blocks.map(() => new Float64Array(groupCount));

  function place(block: number, group: number) {
    groupOf[block] = group;
    if (blocks[block].isAnchor) anchors[group] += blocks[block].size;
    else members[group] += blocks[block].size;
    for (let other = 0; other < blocks.length; other += 1) {
      if (other !== block) affinity[other][group] += weight[block][other];
    }
  }
  function unplace(block: number) {
    const group = groupOf[block];
    if (blocks[block].isAnchor) anchors[group] -= blocks[block].size;
    else members[group] -= blocks[block].size;
    for (let other = 0; other < blocks.length; other += 1) {
      if (other !== block) affinity[other][group] -= weight[block][other];
    }
    groupOf[block] = -1;
  }

  const order = shuffled(
    blocks.map((_, index) => index),
    next
  ).sort((left, right) => blocks[right].size - blocks[left].size);

  // 1. Kerngroepen: elk hun eigen groep.
  const teams = order.filter((index) => blocks[index].isTeam);
  teams.slice(0, groupCount).forEach((block, group) => {
    place(block, group);
    fixed[block] = true;
    open[group] = blocks[block].acceptsExtra;
  });

  // 2. De overige kern: eerst groepen zonder kern of onder het minimum, dan
  // waar de interesses het best overeenkomen.
  for (const block of order) {
    if (!blocks[block].isAnchor || groupOf[block] !== -1) continue;
    const size = blocks[block].size;
    let best = -1;
    let bestKey: [number, number, number] | null = null;
    for (let group = 0; group < groupCount; group += 1) {
      if (!open[group] && anchors[group] > 0) continue;
      const overMax = anchorMax != null && anchors[group] + size > anchorMax ? 1 : 0;
      const needs = anchors[group] === 0 ? 0 : anchorMin != null && anchors[group] < anchorMin ? 1 : 2;
      const key: [number, number, number] = [overMax, needs, -affinity[block][group] + anchors[group] * 1e-6];
      if (
        !bestKey ||
        key[0] < bestKey[0] ||
        (key[0] === bestKey[0] && key[1] < bestKey[1]) ||
        (key[0] === bestKey[0] && key[1] === bestKey[1] && key[2] < bestKey[2])
      ) {
        best = group;
        bestKey = key;
      }
    }
    if (best === -1) {
      // Elke groep is een gesloten kerngroep: dan toch bij de kleinste.
      best = anchors.indexOf(Math.min(...anchors));
    }
    place(block, best);
  }

  // 3. Gewone leden: eerst iedere groep tot het minimum, dan waar ze passen.
  for (const block of order) {
    if (blocks[block].isAnchor) continue;
    const size = blocks[block].size;
    let best = -1;
    let bestKey: [number, number, number] | null = null;
    for (let group = 0; group < groupCount; group += 1) {
      const overMax = members[group] + size > params.maxMembers ? 1 : 0;
      const belowMin = members[group] < params.minMembers ? 0 : 1;
      const key: [number, number, number] = [overMax, belowMin, -affinity[block][group] + members[group] * 1e-6];
      if (
        !bestKey ||
        key[0] < bestKey[0] ||
        (key[0] === bestKey[0] && key[1] < bestKey[1]) ||
        (key[0] === bestKey[0] && key[1] === bestKey[1] && key[2] < bestKey[2])
      ) {
        best = group;
        bestKey = key;
      }
    }
    place(block, best);
  }

  // 4. Verbeteren: verplaatsen en wisselen.
  function violationOf(group: number, memberDelta: number, anchorDelta: number): number {
    return (
      outside(members[group] + memberDelta, params.minMembers, params.maxMembers) +
      outside(anchors[group] + anchorDelta, anchorMin, anchorMax) +
      // Een groep zonder kern telt zwaar wanneer er kern is om te verdelen.
      (hasAnchors && anchors[group] + anchorDelta <= 0 ? 1 : 0)
    );
  }
  function canHostAnchor(group: number, block: number): boolean {
    // Een gesloten kerngroep neemt geen andere kern aan.
    return open[group] || !blocks[block].isAnchor;
  }
  function deltas(block: number): [number, number] {
    return blocks[block].isAnchor ? [0, blocks[block].size] : [blocks[block].size, 0];
  }

  const epsilon = 1e-9;
  for (let pass = 0; pass < 60; pass += 1) {
    let improved = false;
    for (const block of shuffled(order, next)) {
      if (fixed[block]) continue;
      const from = groupOf[block];
      const [memberSize, anchorSize] = deltas(block);

      // Verplaatsen
      for (let to = 0; to < groupCount; to += 1) {
        if (to === from || !canHostAnchor(to, block)) continue;
        const before = violationOf(from, 0, 0) + violationOf(to, 0, 0);
        const after =
          violationOf(from, -memberSize, -anchorSize) + violationOf(to, memberSize, anchorSize);
        const gain = affinity[block][to] - affinity[block][from];
        if (after < before || (after === before && gain > epsilon)) {
          unplace(block);
          place(block, to);
          improved = true;
          break;
        }
      }
      if (groupOf[block] !== from) continue;

      // Wisselen met een blok van dezelfde soort in een andere groep
      for (let other = 0; other < blocks.length; other += 1) {
        const to = groupOf[other];
        if (to === from || fixed[other] || blocks[other].isAnchor !== blocks[block].isAnchor) continue;
        const [otherMembers, otherAnchors] = deltas(other);
        const before = violationOf(from, 0, 0) + violationOf(to, 0, 0);
        const after =
          violationOf(from, otherMembers - memberSize, otherAnchors - anchorSize) +
          violationOf(to, memberSize - otherMembers, anchorSize - otherAnchors);
        const gain =
          affinity[block][to] -
          weight[block][other] -
          affinity[block][from] +
          (affinity[other][from] - weight[block][other] - affinity[other][to]);
        if (after < before || (after === before && gain > epsilon)) {
          unplace(block);
          unplace(other);
          place(block, to);
          place(other, from);
          improved = true;
          break;
        }
      }
    }
    if (!improved) break;
  }

  let violation = 0;
  for (let group = 0; group < groupCount; group += 1) violation += violationOf(group, 0, 0);
  let score = 0;
  for (let block = 0; block < blocks.length; block += 1) score += affinity[block][groupOf[block]];
  return { groupOf, violation, score: score / 2 };
}

// ---------------------------------------------------------------------------

export function makeGroups(
  entries: readonly GroupingEntryInput[],
  fields: readonly GroupingFieldSpec[],
  params: GroupingParams,
  options: { seed?: number; attempts?: number } = {}
): GroupingResult {
  const warnings: GroupingWarning[] = [];
  if (entries.length === 0) return { groups: [], warnings: [{ code: "NO_ENTRIES" }] };

  const parsed = entries.map((entry) => readEntry(entry, fields));
  const blocks = buildBlocks(parsed, Math.max(1, params.maxMembers), warnings);

  // Het gewicht tussen twee blokken: de som over hun inzendingen, maal het
  // aantal personen achter elke inzending.
  const score = pairScorer(fields, entries);
  const indexById = new Map(entries.map((entry, index) => [entry.id, index]));
  const blockEntries = blocks.map((block) =>
    block.entryIds.map((id) => indexById.get(id) as number)
  );
  const weight = blocks.map(() => new Float64Array(blocks.length));
  for (let left = 0; left < blocks.length; left += 1) {
    for (let right = left + 1; right < blocks.length; right += 1) {
      let total = 0;
      for (const a of blockEntries[left]) {
        for (const b of blockEntries[right]) {
          total += score(entries[a], entries[b]) * parsed[a].size * parsed[b].size;
        }
      }
      weight[left][right] = total;
      weight[right][left] = total;
    }
  }

  const memberPeople = blocks.filter((b) => !b.isAnchor).reduce((sum, b) => sum + b.size, 0);
  const anchorPeople = blocks.filter((b) => b.isAnchor).reduce((sum, b) => sum + b.size, 0);
  const teams = blocks.filter((block) => block.isTeam).length;
  const groupCount = Math.min(
    blocks.length,
    chooseGroupCount(memberPeople, anchorPeople, teams, params, warnings)
  );

  const tries = Math.max(1, options.attempts ?? 6);
  let best: Attempt | null = null;
  for (let index = 0; index < tries; index += 1) {
    const result = attempt(blocks, weight, groupCount, params, (options.seed ?? 1) + index * 7919);
    if (
      !best ||
      result.violation < best.violation ||
      (result.violation === best.violation && result.score > best.score + 1e-9)
    ) {
      best = result;
    }
  }

  const groups: GroupingResult["groups"] = Array.from({ length: groupCount }, () => ({
    members: [],
  }));
  blocks.forEach((block, index) => {
    for (const entryId of block.entryIds) {
      groups[best!.groupOf[index]].members.push({ entryId, isAnchor: block.isAnchor });
    }
  });

  // Wat na het verbeteren nog buiten de grenzen valt, meldt het resultaat zelf.
  const sizeById = new Map(parsed.map((entry) => [entry.id, entry.size]));
  const hasAnchors = anchorPeople > 0;
  groups.forEach((group, index) => {
    const people = (isAnchor: boolean) =>
      group.members
        .filter((member) => member.isAnchor === isAnchor)
        .reduce((sum, member) => sum + (sizeById.get(member.entryId) ?? 1), 0);
    const memberCount = people(false);
    const anchorCount = people(true);
    const number = index + 1;
    if (memberPeople > 0 && memberCount < params.minMembers) {
      warnings.push({ code: "GROUP_TOO_SMALL", group: number, detail: String(memberCount) });
    }
    if (memberCount > params.maxMembers) {
      warnings.push({ code: "GROUP_TOO_LARGE", group: number, detail: String(memberCount) });
    }
    if (hasAnchors && (anchorCount === 0 || (params.minAnchors != null && anchorCount < params.minAnchors))) {
      warnings.push({ code: "ANCHORS_TOO_FEW", group: number, detail: String(anchorCount) });
    }
    if (hasAnchors && params.maxAnchors != null && anchorCount > params.maxAnchors) {
      warnings.push({ code: "ANCHORS_TOO_MANY", group: number, detail: String(anchorCount) });
    }
  });

  return { groups, warnings };
}

/** Het aantal personen achter één inzending, zoals de indeling het telt. */
export function registrationSize(
  entry: GroupingEntryInput,
  fields: readonly GroupingFieldSpec[]
): number {
  return readEntry(entry, fields).size;
}
