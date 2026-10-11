/*
 * Tellen, zonder database. De server haalt de rijen op (`server.ts`), dit
 * rekent ze om tot een stand per praesidiumlid. Zie docs/design-decisions.md,
 * "Shiftenoverzicht praesidium", voor wat er telt en waarom.
 */

export type CountMode = "PER_NAME" | "BY_DURATION";
export type ListKind = "EVENT" | "WEEKLY";

export type SheetSetting = { name: string; kind: string; names: number; date: string | null; counted: boolean };
export type ColorSetting = { color: string | null; names: number; samples: string[]; counted: boolean };
export type SlotStat = { sheet: string; color: string; empty: number };

export type StatsList = {
  id: string;
  kind: ListKind;
  name: string;
  eventDate: Date | null;
  expectedPerMember: number | null;
  countMode: CountMode;
  hoursPerShift: number;
  sheets: SheetSetting[];
  colors: ColorSetting[];
};

export type StatsEntry = {
  listId: string;
  nameKey: string;
  sheet: string;
  color: string | null;
  hours: number | null;
  excluded: boolean;
};

export type StatsName = {
  listId: string;
  nameKey: string;
  status: "MATCHED" | "IGNORED" | "UNRESOLVED";
  userId: string | null;
};

export type StatsSiteShift = {
  shiftId: string;
  userId: string;
  necessary: boolean;
};

export type StatsWeeklyEntry = StatsEntry & { date: Date | null };

/** Een vakje telt als zijn tabblad en zijn kleur meetellen en de lijst het niet uitsluit. */
export function entryCounts(list: StatsList, entry: StatsEntry): boolean {
  if (entry.excluded) return false;
  const sheet = list.sheets.find((s) => s.name === entry.sheet);
  if (sheet && !sheet.counted) return false;
  if (list.kind === "EVENT" && list.colors.length > 0) {
    const color = list.colors.find((c) => c.color === entry.color);
    if (color && !color.counted) return false;
  }
  return true;
}

/**
 * Hoeveel shiften een vakje waard is. Per naam: één. Naar duur: de uren gedeeld
 * door de lengte van een shift, afgerond op een kwart (24UL: een uur is een
 * halve shift). Zonder gekend einde ("tot einde") telt het als één shift.
 */
export function entryWeight(list: StatsList, entry: Pick<StatsEntry, "hours">): number {
  if (list.countMode !== "BY_DURATION" || entry.hours === null || list.hoursPerShift <= 0) return 1;
  return Math.max(0.25, Math.round((entry.hours / list.hoursPerShift) * 4) / 4);
}

/** De beslissing per (lijst, schrijfwijze), om vakjes snel aan iemand te hangen. */
export function nameIndex(names: StatsName[]): Map<string, StatsName> {
  const index = new Map<string, StatsName>();
  for (const name of names) index.set(`${name.listId}\u0000${name.nameKey}`, name);
  return index;
}

/** Wie een vakje is, of null als het (nog) niemand van het praesidium is. */
export function entryUser(index: Map<string, StatsName>, entry: Pick<StatsEntry, "listId" | "nameKey">): string | null {
  const name = index.get(`${entry.listId}\u0000${entry.nameKey}`);
  return name && name.status === "MATCHED" && name.userId ? name.userId : null;
}

export type ListSummary = {
  /** Shiften die meetellen op deze lijst (alle namen, ook van wie geen praesidium is). */
  counted: number;
  /** Daarvan door een praesidiumlid. */
  praesidium: number;
  /** Door iemand die bewust geen praesidium is (werkgroep, andere kring, genegeerd). */
  others: number;
  /** Namen die nog op een keuze wachten, en hoeveel shiften daaraan hangen. */
  unresolvedNames: number;
  unresolvedShifts: number;
  /** Per praesidiumlid. */
  perUser: Map<string, number>;
};

export function summarizeList(list: StatsList, entries: StatsEntry[], names: StatsName[]): ListSummary {
  const index = nameIndex(names);
  const perUser = new Map<string, number>();
  const unresolved = new Set<string>();
  let counted = 0;
  let praesidium = 0;
  let others = 0;
  let unresolvedShifts = 0;
  for (const entry of entries) {
    if (entry.listId !== list.id || !entryCounts(list, entry)) continue;
    const weight = entryWeight(list, entry);
    counted += weight;
    const name = index.get(`${entry.listId}\u0000${entry.nameKey}`);
    const userId = entryUser(index, entry);
    if (userId) {
      praesidium += weight;
      perUser.set(userId, (perUser.get(userId) ?? 0) + weight);
    } else if (!name || name.status === "UNRESOLVED" || (name.status === "MATCHED" && !name.userId)) {
      unresolved.add(entry.nameKey);
      unresolvedShifts += weight;
    } else {
      others += weight;
    }
  }
  return { counted, praesidium, others, unresolvedNames: unresolved.size, unresolvedShifts, perUser };
}

export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export type MemberTotals = {
  userId: string;
  /** Som over de shiftenlijsten van evenementen. */
  lists: number;
  perList: Map<string, number>;
  siteNecessary: number;
  siteVoluntary: number;
  site: number;
  /** Shiftenlijsten plus de shiften op /shift. */
  total: number;
  /** Wekelijkse praesidiumshiften: al voorbij en nog te komen. */
  weeklyPast: number;
  weeklyUpcoming: number;
};

/**
 * De stand per praesidiumlid. Iedereen uit `memberIds` krijgt een rij, ook wie
 * nergens op staat: een nul is precies wat de vice zoekt.
 */
export function memberTotals(input: {
  memberIds: string[];
  eventLists: StatsList[];
  weeklyLists: StatsList[];
  entries: (StatsEntry & { date?: Date | null })[];
  names: StatsName[];
  siteShifts: StatsSiteShift[];
  now: Date;
}): MemberTotals[] {
  const rows = new Map<string, MemberTotals>();
  for (const userId of input.memberIds) {
    rows.set(userId, {
      userId,
      lists: 0,
      perList: new Map(),
      siteNecessary: 0,
      siteVoluntary: 0,
      site: 0,
      total: 0,
      weeklyPast: 0,
      weeklyUpcoming: 0,
    });
  }
  const index = nameIndex(input.names);
  const lists = new Map<string, StatsList>();
  for (const list of [...input.eventLists, ...input.weeklyLists]) lists.set(list.id, list);
  const today = new Date(Date.UTC(input.now.getUTCFullYear(), input.now.getUTCMonth(), input.now.getUTCDate()));

  for (const entry of input.entries) {
    const list = lists.get(entry.listId);
    if (!list || !entryCounts(list, entry)) continue;
    const userId = entryUser(index, entry);
    const row = userId ? rows.get(userId) : undefined;
    if (!row) continue;
    const weight = entryWeight(list, entry);
    if (list.kind === "EVENT") {
      row.lists += weight;
      row.perList.set(list.id, (row.perList.get(list.id) ?? 0) + weight);
    } else if (entry.date && entry.date >= today) {
      row.weeklyUpcoming += weight;
    } else {
      row.weeklyPast += weight;
    }
  }

  for (const shift of input.siteShifts) {
    const row = rows.get(shift.userId);
    if (!row) continue;
    if (shift.necessary) row.siteNecessary += 1;
    else row.siteVoluntary += 1;
  }

  for (const row of rows.values()) {
    row.site = row.siteNecessary + row.siteVoluntary;
    row.total = row.lists + row.site;
  }
  return [...rows.values()];
}

export type Averages = {
  lists: number;
  siteNecessary: number;
  siteVoluntary: number;
  site: number;
  total: number;
  weekly: number;
};

export function averages(rows: MemberTotals[]): Averages {
  return {
    lists: average(rows.map((r) => r.lists)),
    siteNecessary: average(rows.map((r) => r.siteNecessary)),
    siteVoluntary: average(rows.map((r) => r.siteVoluntary)),
    site: average(rows.map((r) => r.site)),
    total: average(rows.map((r) => r.total)),
    weekly: average(rows.map((r) => r.weeklyPast + r.weeklyUpcoming)),
  };
}

/** Lege vakjes in een kleur en op een tabblad die meetellen: de suggestie voor "nog open". */
export function detectedOpenSlots(list: StatsList, slots: SlotStat[]): number | null {
  if (list.kind !== "EVENT") return null;
  const coloured = list.colors.filter((c) => c.color && c.color !== "FFFFFF");
  const countedColors = coloured.filter((c) => c.counted);
  if (countedColors.length === 0) return null;
  // Staan er namen in meer dan één kleur en tellen ze allemaal mee, dan zegt
  // een leeg vakje niets over VTK: op een lijst met meerdere kringen zijn dat
  // ook de vakjes van de anderen. Pas met een kleurkeuze weten we het.
  if (coloured.length > 1 && countedColors.length === coloured.length) return null;
  let open = 0;
  for (const slot of slots) {
    const sheet = list.sheets.find((s) => s.name === slot.sheet);
    if (sheet && !sheet.counted) continue;
    if (countedColors.some((c) => c.color === slot.color)) open += slot.empty;
  }
  return open;
}

/** "5,5" en "6": zo schrijft de vice het zelf. */
export function formatCount(value: number, locale: "nl" | "en" = "nl"): string {
  const rounded = Math.round(value * 100) / 100;
  return rounded.toLocaleString(locale === "nl" ? "nl-BE" : "en-GB", { maximumFractionDigits: 2 });
}
