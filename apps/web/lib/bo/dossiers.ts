import type { BoLine } from "./figures";
import { normalizeKey, parseDocumentName, type BoKind, type MeetingKind } from "./names";
import { BO_EXTRA_POSTS, postName, resolvePostKeys, splitPost, type PostAliases, type PostCandidate } from "./posts";

/*
 * Van losse bestanden naar wat het BO wil weten: per post, per activiteit, is
 * er een budget, is er een resultaat, en hoe verhouden de bedragen zich.
 *
 * Een "dossier" is één activiteit van één post in één werkingsjaar: de
 * budgetten die erover passeerden (een uitgesteld budget passeert twee keer) en
 * de resultaten. Budget en resultaat horen samen wanneer jaar, post en
 * activiteit in de naam overeenkomen, na het wegvegen van hoofdletters,
 * accenten en leestekens. Lukt dat niet, dan koppelt Groep 5 met de hand
 * (`pairedBudgetId`).
 *
 * Daarbovenop de cijfers die de verkenner op /admin/bestuursorgaan toont: per
 * post en voor het hele jaar hoeveel voorbije activiteiten een resultaat
 * hebben, de sommen, de afwijking, en hoe lang een resultaat op zich laat
 * wachten; per BO wat er passeerde.
 *
 * Puur: de database-rijen komen binnen, het overzicht gaat buiten.
 */

export type DocInput = {
  id: string;
  name: string;
  webUrl: string;
  folderKind: BoKind | null;
  meeting: {
    id: string;
    name: string;
    kind: MeetingKind;
    number: number | null;
    date: Date | null;
    workingYear: number;
  };
  sheetPost: string | null;
  sheetTitle: string | null;
  eventDate: Date | null;
  budgetTotalCents: number | null;
  resultTotalCents: number | null;
  allocationCents: number | null;
  vtkSharePercent: number | null;
  lines?: BoLine[] | null;
  location?: string | null;
  figuresError: string | null;
  missing: boolean;
  pairedBudgetId: string | null;
  /** Met de hand gekozen posten voor dit bestand; leeg = uit de naam. */
  postKeysOverride?: readonly string[];
  /** Een resultaat zonder budget op het BO: "grocomeet" of "geen". */
  budgetWaiver?: string | null;
};

/** Een map in de BO-map, ook zonder bestanden: een BO waar niets passeerde, telt ook. */
export type MeetingInput = {
  id: string;
  name: string;
  kind: MeetingKind;
  number: number | null;
  date: Date | null;
  workingYear: number;
  webUrl: string;
  missing: boolean;
};

export type DocView = {
  id: string;
  name: string;
  webUrl: string;
  kind: BoKind;
  /** De naam zegt het ene, de map het andere; de naam won. */
  folderConflict: boolean;
  meetingId: string;
  /** "BO 5", "Begrotings-BO 4" of "Schriftelijk". */
  meetingLabel: string;
  meetingDate: Date | null;
  workingYear: number;
  /** Het bedrag dat bij dit soort hoort: het budget of het resultaat. */
  totalCents: number | null;
  figuresError: string | null;
  missing: boolean;
  paired: boolean;
  /** Een resultaat waarvoor geen budget op het BO hoefde (zie `budgetWaiver`). */
  waiver: string | null;
  /** De posten van dit bestand zijn met de hand gekozen. */
  overridden: boolean;
};

export type DossierStatus =
  /** Er is een resultaat. */
  | "DONE"
  /** Budget gezien, activiteit nog niet geweest. */
  | "UPCOMING"
  /** Budget gezien, activiteit voorbij (of zonder datum), geen resultaat. */
  | "OPEN"
  /** Een resultaat waarvan het budget niet gevonden werd. */
  | "NO_BUDGET";

export type Dossier = {
  key: string;
  /** Meestal één; twee bij "Cultuur+Onthaal" of wanneer Groep 5 er twee koos. */
  postKeys: string[];
  activity: string;
  /** Het werkingsjaar uit de naam ("26-27"), anders dat van de vergadering. */
  year: number;
  budgets: DocView[];
  results: DocView[];
  status: DossierStatus;
  eventDate: Date | null;
  /**
   * Een datum uit het rekenblad die niet bij de BO past (een sjabloon van vorig
   * jaar, een tikfout): getoond, maar niet gebruikt om te rekenen.
   */
  dateIgnored: Date | null;
  location: string | null;
  /** Zie `DocView.waiver`. */
  waiver: string | null;
  /** De posten werden met de hand gekozen, niet uit de naam gehaald. */
  overridden: boolean;
  budgetCents: number | null;
  resultCents: number | null;
  allocationCents: number | null;
  /** Resultaat min budget; positief is beter dan gepland. */
  devCents: number | null;
  vtkSharePercent: number | null;
  /** Dagen tussen de activiteit en de BO waarop het resultaat passeerde. */
  lagDays: number | null;
  /** Bij een open resultaat: dagen sinds de activiteit, of sinds het budget zonder datum. */
  overdueDays: number | null;
  /** Het budget plant slechter dan de begroting. */
  overAllocation: boolean;
  /** De posten uit het laatste resultaat, anders uit het laatste budget. */
  lines: BoLine[];
  /** De laatste vergadering waarop het dossier passeerde, om op te sorteren. */
  lastSeen: Date | null;
};

export type Stats = {
  dossiers: number;
  budgets: number;
  results: number;
  /** Activiteiten die voorbij zijn (of geen datum hebben): daar hoort een resultaat bij. */
  due: number;
  done: number;
  /** done / due; null zolang er niets voorbij is. */
  pct: number | null;
  open: number;
  upcoming: number;
  sumBudget: number;
  sumAllocation: number;
  /** Enkel over de afgeronde activiteiten, zodat ze naast hun budget te leggen zijn. */
  sumDoneBudget: number;
  sumResult: number;
  sumDev: number;
  better: number;
  worse: number;
  avgLagDays: number | null;
  overAllocation: number;
  oldest: { key: string; activity: string; days: number } | null;
};

export type PostSection = "g5" | "post" | "werkgroep" | "extra" | "unknown";

export type PostBlock = {
  key: string;
  groupId: string | null;
  /** Waar de post in de linkerkolom staat. */
  section: PostSection;
  /** De naam van de post, of de schrijfwijze uit de bestanden als de site de post niet kent. */
  name: string;
  dossiers: Dossier[];
  open: number;
  stats: Stats;
};

export type MeetingView = {
  id: string;
  name: string;
  label: string;
  kind: MeetingKind;
  date: Date | null;
  /** Nog niet geweest: de map wordt al gevuld voor de volgende BO. */
  upcoming: boolean;
  missing: boolean;
  webUrl: string;
  budgets: { docId: string; dossierKey: string }[];
  results: { docId: string; dossierKey: string }[];
  sumBudget: number;
  sumResult: number;
  sumDev: number;
  postKeys: string[];
};

export type UnknownPost = {
  key: string;
  label: string;
  files: { id: string; name: string }[];
  /**
   * Geen woord maar een datum of een getal ("2026/09/07"): dat is geen
   * schrijfwijze om te onthouden, dus kies je per bestand.
   */
  perDocument: boolean;
};

export type PairCandidate = { id: string; label: string; group: string };
export type Pairable = { result: DocView; activity: string; postName: string; candidates: PairCandidate[] };

export type BoOverview = {
  posts: PostBlock[];
  /** Een schrijfwijze die geen post is die de site kent. */
  unknownPosts: UnknownPost[];
  /** Bestanden die niet zeggen of ze een budget of resultaat zijn, of van welke post. */
  unclassified: { id: string; name: string; webUrl: string; meetingLabel: string }[];
  /** Resultaten zonder budget, met de budgetten van dezelfde post die nog open staan. */
  pairable: Pairable[];
  /** Bestanden die de site niet kan openen. */
  unreachable: DocView[];
  totals: { budgets: number; results: number; open: number };
  global: Stats;
  meetings: MeetingView[];
};

export type PostRow = PostCandidate & { orderInPraesidium: number; type: "PRAESIDIUM" | "WERKGROEP" | string };

export function meetingLabel(meeting: { kind: MeetingKind; number: number | null; name: string }, nl = true): string {
  if (meeting.kind === "WRITTEN") return nl ? "Schriftelijk" : "In writing";
  if (meeting.number === null) return meeting.name;
  return meeting.kind === "BUDGET_MEETING"
    ? nl
      ? `Begrotings-BO ${meeting.number}`
      : `Budget meeting ${meeting.number}`
    : `BO ${meeting.number}`;
}

type Classified = {
  doc: DocInput;
  view: DocView;
  year: number;
  postKeys: string[];
  postLabel: string;
  activity: string;
  activityKey: string;
};

const DAY = 86_400_000;

function dayStart(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function days(from: Date, to: Date): number {
  return Math.round((dayStart(to) - dayStart(from)) / DAY);
}

const sum = (values: (number | null)[]) => values.reduce<number>((total, v) => total + (v ?? 0), 0);

/** Wat `statsOf` van een dossier nodig heeft; ook de JSON-vorm voor de browser past. */
export type StatsInput = Pick<
  Dossier,
  "key" | "activity" | "status" | "budgetCents" | "allocationCents" | "resultCents" | "devCents" | "lagDays" | "overdueDays" | "overAllocation"
> & { budgets: readonly unknown[]; results: readonly unknown[] };

/** De cijfers van een rij dossiers: een post, het hele jaar, of een groep in de lijst. */
export function statsOf(dossiers: readonly StatsInput[]): Stats {
  const due = dossiers.filter((d) => d.status === "DONE" || d.status === "OPEN");
  const done = dossiers.filter((d) => d.status === "DONE");
  const open = dossiers.filter((d) => d.status === "OPEN");
  const lags = done.map((d) => d.lagDays).filter((x): x is number => x !== null);
  const oldest = [...open].sort((a, b) => (b.overdueDays ?? 0) - (a.overdueDays ?? 0))[0];
  return {
    dossiers: dossiers.length,
    budgets: dossiers.filter((d) => d.budgets.length > 0).length,
    results: dossiers.filter((d) => d.results.length > 0).length,
    due: due.length,
    done: done.length,
    pct: due.length ? done.length / due.length : null,
    open: open.length,
    upcoming: dossiers.filter((d) => d.status === "UPCOMING").length,
    sumBudget: sum(dossiers.map((d) => d.budgetCents)),
    sumAllocation: sum(dossiers.map((d) => d.allocationCents)),
    sumDoneBudget: sum(done.map((d) => d.budgetCents)),
    sumResult: sum(done.map((d) => d.resultCents)),
    sumDev: sum(done.map((d) => d.devCents)),
    better: done.filter((d) => (d.devCents ?? 0) > 0).length,
    worse: done.filter((d) => (d.devCents ?? 0) < 0).length,
    avgLagDays: lags.length ? Math.round(lags.reduce((a, b) => a + b, 0) / lags.length) : null,
    overAllocation: dossiers.filter((d) => d.overAllocation).length,
    oldest: oldest ? { key: oldest.key, activity: oldest.activity, days: oldest.overdueDays ?? 0 } : null,
  };
}

const SECTION_ORDER: Record<PostSection, number> = { g5: 0, post: 1, werkgroep: 2, extra: 3, unknown: 4 };

export function buildOverview(
  docs: readonly DocInput[],
  posts: readonly PostRow[],
  aliases: PostAliases,
  year: number,
  today: Date,
  nl = true,
  meetings: readonly MeetingInput[] = [],
): BoOverview {
  const classified: Classified[] = [];
  const unclassified: BoOverview["unclassified"] = [];

  for (const doc of docs) {
    const parsed = parseDocumentName(doc.name);
    const kind = parsed.kind ?? doc.folderKind;
    const label = meetingLabel(doc.meeting, nl);
    const override = (doc.postKeysOverride ?? []).filter(Boolean);
    const postLabel = parsed.post ?? doc.sheetPost;
    // Zonder soort weet de site niet wat het is; zonder post vraagt ze die per
    // bestand (bij Na te kijken), want daar valt nog iets aan te doen.
    if (!kind) {
      if (doc.meeting.workingYear === year && !doc.missing) {
        unclassified.push({ id: doc.id, name: doc.name, webUrl: doc.webUrl, meetingLabel: label });
      }
      continue;
    }
    let split = parsed.post
      ? splitPost(parsed.post, parsed.activity, posts, aliases)
      : { label: postLabel ?? "", postKeys: resolvePostKeys(postLabel ?? "", posts, aliases), activity: parsed.activity };
    // Een post die de naam niet noemt, maar het blad wel ("26-27_Development_ECC"
    // heeft er een, een naam met enkel een datum niet).
    if (split.postKeys.length === 0 && doc.sheetPost) {
      const fromSheet = resolvePostKeys(doc.sheetPost, posts, aliases);
      if (fromSheet.length > 0 && !/[a-z]/i.test(split.label)) {
        split = { label: doc.sheetPost, postKeys: fromSheet, activity: [parsed.post, parsed.activity].filter(Boolean).join(" ") || null };
      }
    }
    const postKeys = override.length > 0 ? [...override] : split.postKeys.length > 0 ? split.postKeys : [`l:${normalizeKey(split.label)}`];
    const activity = split.activity ?? doc.sheetTitle ?? doc.name;
    classified.push({
      doc,
      view: {
        id: doc.id,
        name: doc.name,
        webUrl: doc.webUrl,
        kind,
        folderConflict: Boolean(parsed.kind && doc.folderKind && parsed.kind !== doc.folderKind),
        meetingId: doc.meeting.id,
        meetingLabel: label,
        meetingDate: doc.meeting.date,
        workingYear: doc.meeting.workingYear,
        totalCents: kind === "BUDGET" ? doc.budgetTotalCents : doc.resultTotalCents,
        figuresError: doc.figuresError,
        missing: doc.missing,
        paired: Boolean(doc.pairedBudgetId),
        waiver: kind === "RESULT" ? (doc.budgetWaiver ?? null) : null,
        overridden: override.length > 0,
      },
      year: parsed.year ?? doc.meeting.workingYear,
      postKeys,
      postLabel: split.label,
      activity,
      activityKey: normalizeKey(activity),
    });
  }

  // Wat bij elkaar hoort: zelfde jaar en activiteit, en minstens één post
  // gemeen ("Cultuur+Onthaal_Jeneverwandeling" en "Cultuur_Jeneverwandeling"
  // zijn één activiteit). Een resultaat dat met de hand bij een budget gezet
  // werd, volgt dat budget.
  const parent = classified.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const join = (a: number, b: number) => {
    parent[find(a)] = find(b);
  };
  const index = new Map(classified.map((c, i) => [c.doc.id, i]));
  const buckets = new Map<string, number[]>();
  classified.forEach((c, i) => {
    const bucket = `${c.year}|${c.activityKey}`;
    buckets.set(bucket, [...(buckets.get(bucket) ?? []), i]);
  });
  for (const members of buckets.values()) {
    for (let a = 0; a < members.length; a += 1) {
      for (let b = a + 1; b < members.length; b += 1) {
        const x = classified[members[a]];
        const y = classified[members[b]];
        if (x.postKeys.some((k) => y.postKeys.includes(k))) join(members[a], members[b]);
      }
    }
  }
  classified.forEach((c, i) => {
    const budget = c.doc.pairedBudgetId ? index.get(c.doc.pairedBudgetId) : undefined;
    if (budget !== undefined && c.view.kind === "RESULT") join(i, budget);
  });
  const groups = new Map<number, Classified[]>();
  classified.forEach((c, i) => {
    const root = find(i);
    groups.set(root, [...(groups.get(root) ?? []), c]);
  });

  const byMeeting = (a: Classified, b: Classified) =>
    (a.view.meetingDate?.getTime() ?? 0) - (b.view.meetingDate?.getTime() ?? 0);
  const todayStart = dayStart(today);

  const built: { dossier: Dossier; postLabel: string; inYear: boolean }[] = [];
  for (const items of groups.values()) {
    const budgetItems = items.filter((c) => c.view.kind === "BUDGET").sort(byMeeting);
    const resultItems = items.filter((c) => c.view.kind === "RESULT").sort(byMeeting);
    const lastBudget = budgetItems.at(-1);
    const lastResult = resultItems.at(-1);
    // De posten en de naam komen uit het budget (dat kwam eerst); een resultaat
    // dat met de hand gekoppeld werd, volgt ze.
    const lead = budgetItems[0] ?? items[0];
    const postKeys = budgetItems.length > 0
      ? [...new Set(budgetItems.flatMap((c) => c.postKeys))]
      : [...new Set(items.flatMap((c) => c.postKeys))];

    // Een datum die niet bij de BO past, telt niet: een sjabloon van vorig jaar
    // gaf anders "8043 dagen open".
    const meetingTimes = items.map((c) => c.view.meetingDate?.getTime()).filter((t): t is number => t !== undefined);
    let eventDate = lastBudget?.doc.eventDate ?? lastResult?.doc.eventDate ?? null;
    let dateIgnored: Date | null = null;
    if (eventDate && meetingTimes.length > 0) {
      const earliest = Math.min(...meetingTimes) - 180 * DAY;
      const latest = Math.max(...meetingTimes) + 400 * DAY;
      if (eventDate.getTime() < earliest || eventDate.getTime() > latest) {
        dateIgnored = eventDate;
        eventDate = null;
      }
    }

    const waiver = resultItems.find((c) => c.view.waiver)?.view.waiver ?? null;
    let status: DossierStatus;
    if (resultItems.length > 0) status = budgetItems.length > 0 || waiver ? "DONE" : "NO_BUDGET";
    else status = eventDate && dayStart(eventDate) >= todayStart ? "UPCOMING" : "OPEN";

    const budgetCents = lastBudget?.doc.budgetTotalCents ?? null;
    const resultCents = lastResult?.doc.resultTotalCents ?? null;
    const allocationCents = lastBudget?.doc.allocationCents ?? lastResult?.doc.allocationCents ?? null;
    const resultDate = lastResult?.view.meetingDate ?? null;
    const since = eventDate ?? budgetItems[0]?.view.meetingDate ?? null;
    const resultLines = lastResult?.doc.lines ?? [];
    const lines = resultLines.length > 0 ? resultLines : (lastBudget?.doc.lines ?? []);
    const dates = items.map((c) => c.view.meetingDate?.getTime() ?? 0);

    built.push({
      dossier: {
        key: `${lead.year}|${[...postKeys].sort().join("+")}|${lead.activityKey}`,
        postKeys,
        activity: lead.activity,
        year: lead.year,
        budgets: budgetItems.map((c) => c.view),
        results: resultItems.map((c) => c.view),
        status,
        eventDate,
        dateIgnored,
        location: lastBudget?.doc.location ?? lastResult?.doc.location ?? null,
        waiver,
        overridden: items.some((c) => c.view.overridden),
        budgetCents,
        resultCents,
        allocationCents,
        devCents: status === "DONE" && budgetItems.length > 0 && budgetCents !== null && resultCents !== null ? resultCents - budgetCents : null,
        vtkSharePercent: (lastResult ?? lastBudget)?.doc.vtkSharePercent ?? null,
        lagDays: resultDate && eventDate ? days(eventDate, resultDate) : null,
        overdueDays: status === "OPEN" && since ? Math.max(0, days(since, today)) : null,
        overAllocation: budgetCents !== null && allocationCents !== null && budgetCents < allocationCents,
        lines,
        lastSeen: dates.length > 0 ? new Date(Math.max(...dates)) : null,
      },
      postLabel: lead.postLabel,
      inYear: items.some((c) => c.doc.meeting.workingYear === year),
    });
  }

  const postsById = new Map(posts.map((p) => [p.id, p]));
  const sectionOf = (key: string): PostSection => {
    if (key.startsWith("x:")) return BO_EXTRA_POSTS.find((p) => p.key === key)?.section ?? "extra";
    if (key.startsWith("l:")) return "unknown";
    const post = postsById.get(key.slice(2));
    if (!post) return "unknown";
    if (post.code === "GROEP5") return "g5";
    return post.type === "WERKGROEP" ? "werkgroep" : "post";
  };
  const orderOf = (key: string): number => {
    const extra = BO_EXTRA_POSTS.findIndex((p) => p.key === key);
    if (extra >= 0) return 100 + extra;
    return postsById.get(key.slice(2))?.orderInPraesidium ?? 0;
  };

  const blocks = new Map<string, PostBlock>();
  const unknown = new Map<string, UnknownPost>();
  for (const { dossier, postLabel, inYear } of built) {
    if (!inYear) continue;
    for (const key of dossier.postKeys) {
      const block = blocks.get(key) ?? {
        key,
        groupId: key.startsWith("g:") ? key.slice(2) : null,
        section: sectionOf(key),
        name: postName(key, posts, nl) ?? (postLabel || (nl ? "Zonder post" : "No post")),
        dossiers: [],
        open: 0,
        stats: statsOf([]),
      };
      block.dossiers.push(dossier);
      if (dossier.status === "OPEN") block.open += 1;
      blocks.set(key, block);
    }

    if (dossier.postKeys.some((k) => k.startsWith("l:"))) {
      // Een naam onthoudt de site voor de volgende bestanden; een naam zonder
      // letters (enkel een datum, of niets) niet, die vraagt ze per activiteit.
      const perDocument = !/[a-z]/.test(normalizeKey(postLabel));
      const key = perDocument ? `${normalizeKey(postLabel)}#${dossier.key}` : normalizeKey(postLabel);
      const entry = unknown.get(key) ?? { key, label: postLabel, files: [], perDocument };
      for (const doc of [...dossier.budgets, ...dossier.results]) {
        if (doc.workingYear === year && !doc.missing) entry.files.push({ id: doc.id, name: doc.name });
      }
      unknown.set(key, entry);
    }
  }

  const sortedBlocks = [...blocks.values()].sort(
    (a, b) =>
      SECTION_ORDER[a.section] - SECTION_ORDER[b.section] ||
      // Groep 5 zelf voor haar vier rollen.
      (a.key.startsWith("g:") ? 0 : 1) - (b.key.startsWith("g:") ? 0 : 1) ||
      orderOf(a.key) - orderOf(b.key) ||
      a.name.localeCompare(b.name, "nl"),
  );
  for (const block of sortedBlocks) {
    block.dossiers.sort(
      (a, b) =>
        (b.lastSeen?.getTime() ?? 0) - (a.lastSeen?.getTime() ?? 0) || a.activity.localeCompare(b.activity, "nl"),
    );
    block.stats = statsOf(block.dossiers);
  }

  // Elk dossier één keer, ook als het bij twee posten hoort.
  const yearDossiers = built.filter((b) => b.inYear).map((b) => b.dossier);
  const nameOf = (key: string) => postName(key, posts, nl) ?? blocks.get(key)?.name ?? key.replace(/^l:/, "");

  // Een resultaat zonder budget, met wat het zou kunnen zijn: elk budget van
  // hetzelfde jaar ("26-27") dat nog geen resultaat heeft, dat van dezelfde
  // post bovenaan. Een resultaat van 25-26 krijgt dus geen budget van dit jaar
  // voorgesteld; zijn budget passeerde vóór de site meelas.
  const pairable: Pairable[] = [];
  for (const dossier of yearDossiers) {
    if (dossier.status !== "NO_BUDGET") continue;
    const result = dossier.results.at(-1);
    if (!result || result.paired || result.workingYear !== year || dossier.year !== year) continue;
    const candidates = built
      .map((b) => b.dossier)
      .filter((d) => d.results.length === 0 && d.budgets.length > 0 && d.year === dossier.year)
      .sort(
        (a, b) =>
          Number(b.postKeys.some((k) => dossier.postKeys.includes(k))) - Number(a.postKeys.some((k) => dossier.postKeys.includes(k))) ||
          a.activity.localeCompare(b.activity, "nl"),
      )
      .map((d) => ({
        id: d.budgets.at(-1)!.id,
        label: `${d.activity} (${d.budgets.at(-1)!.meetingLabel})`,
        group: d.postKeys.map(nameOf).join(" + "),
      }));
    pairable.push({ result, activity: dossier.activity, postName: dossier.postKeys.map(nameOf).join(" + "), candidates });
  }

  // Per BO: wat er passeerde, uit de dossiers van dit jaar.
  const meetingViews: MeetingView[] = meetings
    .filter((m) => m.workingYear === year)
    .map((m) => {
      const pick = (kind: "budgets" | "results") =>
        yearDossiers.flatMap((d) =>
          d[kind].filter((doc) => doc.meetingId === m.id).map((doc) => ({ doc, dossier: d })),
        );
      const budgets = pick("budgets");
      const results = pick("results");
      return {
        id: m.id,
        name: m.name,
        label: meetingLabel(m, nl),
        kind: m.kind,
        date: m.date,
        upcoming: Boolean(m.date && dayStart(m.date) > todayStart),
        missing: m.missing,
        webUrl: m.webUrl,
        budgets: budgets.map(({ doc, dossier }) => ({ docId: doc.id, dossierKey: dossier.key })),
        results: results.map(({ doc, dossier }) => ({ docId: doc.id, dossierKey: dossier.key })),
        sumBudget: sum(budgets.map(({ doc }) => doc.totalCents)),
        sumResult: sum(results.map(({ doc }) => doc.totalCents)),
        sumDev: sum(results.map(({ dossier }) => dossier.devCents)),
        postKeys: [...new Set([...budgets, ...results].flatMap(({ dossier }) => dossier.postKeys))],
      };
    })
    // Nieuwste eerst; de schriftelijke goedkeuring heeft geen datum en staat onderaan.
    .sort((a, b) => (!a.date ? 1 : !b.date ? -1 : b.date.getTime() - a.date.getTime()));

  const inYearDocs = classified.filter((c) => c.doc.meeting.workingYear === year);
  const global = statsOf(yearDossiers);
  return {
    posts: sortedBlocks,
    unknownPosts: [...unknown.values()].filter((u) => u.files.length > 0).sort((a, b) => a.label.localeCompare(b.label, "nl")),
    unclassified,
    pairable,
    unreachable: inYearDocs.filter((c) => c.doc.figuresError === "NO_ACCESS" && !c.doc.missing).map((c) => c.view),
    totals: {
      budgets: inYearDocs.filter((c) => c.view.kind === "BUDGET").length,
      results: inYearDocs.filter((c) => c.view.kind === "RESULT").length,
      open: global.open,
    },
    global,
    meetings: meetingViews,
  };
}
