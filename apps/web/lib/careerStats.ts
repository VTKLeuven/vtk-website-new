import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@vtk/db";
import { brusselsYMD, ymdKey } from "@/lib/brussels";
import { CAREER_CATEGORY, type CareerOptInSourceValue } from "@/lib/careerOptIn";
import {
  cumulative,
  dayRange,
  daysBefore,
  joinHistory,
  totalBefore,
  type History,
} from "@/lib/careerTimeline";
import { listWhere } from "@/lib/mailinglists";
import { HISTORY_KEYS, readHistory } from "@/lib/mailingListHistory";
import type { StudyConfirmationViaValue } from "@/lib/studyConfirmation";
import { studyConfirmationYear, currentStudyYear } from "@/lib/workingYear";

/**
 * De cijfers achter de Career-lijst, voor /admin/mailinglijsten.
 *
 * Vier vragen, elk met een uitsplitsing die sluit (de delen tellen op tot het
 * geheel), omdat een los getal naast een ander los getal precies de verwarring
 * gaf die dit moest wegnemen ("waarom 498 als er 870 staat?"):
 *
 * 1. **Wie staat er op de lijst, en waarom de rest niet?** Van alle opt-ins naar
 *    de lijst die in Brevo en in de ZIP zit ({@link CareerStats.list}).
 * 2. **Hoeveel van onze studenten bereiken we?** Van alle accounts met de
 *    status Student naar "onze studenten" ({@link CareerStats.reach}).
 * 3. **Welk scherm vult de lijst?** ({@link CareerStats.bySource}).
 * 4. **Hoe loopt de bevestigingsronde, en wat doet de Career-vraag daar?**
 *    ({@link CareerStats.round}), op de registratie in `StudyConfirmation`.
 *
 * "Onze studenten" is bewust nauwer dan "iedereen met een account": het zijn de
 * leden met een **richting van deze faculteit** aangeduid, want dat is precies
 * het publiek dat Career belooft aan bedrijven.
 */

/** Actieve, niet-verwijderde accounts. De ondergrens van elke telling hier. */
const LIVE: Prisma.UserWhereInput = { active: true, deletedAt: null };
const STUDENT: Prisma.UserWhereInput = { ...LIVE, isStudent: true };
const HAS_CAREER: Prisma.UserWhereInput = { mailCategories: { has: CAREER_CATEGORY } };
const NO_PROGRAMME: Prisma.UserWhereInput = { studyProgrammes: { isEmpty: true } };

/** Studenten van deze faculteit: status Student én minstens één eigen richting. */
export const OUR_STUDENTS: Prisma.UserWhereInput = {
  ...STUDENT,
  notAtFaculty: false,
  studyProgrammes: { isEmpty: false },
};

/**
 * Career aan, student en aan de faculteit: de groep waaruit de lijst komt. Wat
 * er nog tussen staat, is de bevestiging en een uitschrijving via de mail (zie
 * `listWhere`).
 */
export const CAREER_AT_FACULTY: Prisma.UserWhereInput = {
  ...STUDENT,
  notAtFaculty: false,
  ...HAS_CAREER,
};

function notConfirmedFor(year: number): Prisma.UserWhereInput {
  return { OR: [{ studyConfirmedYear: null }, { studyConfirmedYear: { lt: year } }] };
}

/** Hoeveel dagen de staafgrafieken terugkijken. */
export const RECENT_DAYS = 42;

/**
 * De herkomsten zoals de admin ze toont. Een opt-in zonder herkomst is er een
 * van voor 17 september 2026, toen dat nog niet bijgehouden werd, en die kwamen
 * allemaal uit de onboarding (de enige plek waar de vraag toen stond waar
 * nieuwe leden langskwamen). Ze tellen daarom daar, met `onboardedAt` als
 * datum; in de database blijft de kolom leeg, want gemeten is het niet.
 */
export type CareerSource = CareerOptInSourceValue;

export type RoundFunnel = {
  /** Geregistreerde bevestigingen via dit scherm. */
  total: number;
  /** Daarvan: Career stond al aan (dan komt de vraag niet). */
  before: number;
  /** Daarvan: de vraag stond op het scherm. */
  asked: number;
  /** Daarvan: Career aangezet. */
  chosen: number;
};

export type SegmentRow = {
  /** Een `StudyYear`, een `StudyProgramme`, of `NONE` voor "geen jaar". */
  key: string;
  /** Onze studenten die bevestigden voor dit jaar, in dit segment. */
  confirmed: number;
  /** Daarvan op de Career-lijst (Career aan, niet uitgeschreven). */
  onList: number;
  /** Op het bevestigingsscherm: kregen de vraag / duidden aan. */
  asked: number;
  chosen: number;
};

export type DailySeries = {
  days: string[];
  series: Record<string, number[]>;
};

export type CareerStats = {
  /** Het lopende academiejaar (2026 = 26-27); de ronde hieronder. */
  year: number;
  /** De ronde waarop de lijst filtert; loopt een week achter op `year`. */
  confirmationYear: number;

  list: {
    /** Alle actieve accounts met Career aan, ook wie geen student is. */
    total: number;
    /** Daarvan: geen student, of niet aan de faculteit. */
    notAtFaculty: number;
    /** Daarvan: studie nog niet bevestigd voor de lopende ronde. */
    awaitingConfirmation: number;
    /** Daarvan: uitgeschreven via de link in een mail. */
    unsubscribed: number;
    /** Wat overblijft: de lijst zelf, gelijk aan de rij Career erboven. */
    onList: number;
  };

  reach: {
    studentAccounts: number;
    /** Nooit door de onboarding gekomen, dus zonder richting. */
    notOnboarded: number;
    notAtFaculty: number;
    /** Wel door de onboarding, maar zonder richting. */
    noProgramme: number;
    ourStudents: number;
    ourStudentsWithCareer: number;
    ourStudentsShare: number;
    /** Van de faculteit volgens KU Leuven (`firwStudent`). */
    firwStudents: number;
    /** Daarvan ook bij onze studenten. */
    firwOurStudents: number;
  };

  bySource: Record<CareerSource, number>;

  round: {
    /** Studenten die de onboarding afwerkten: wie kan bevestigen. */
    students: number;
    confirmed: number;
    pending: number;
    /** Nog niet bevestigd, met Career aan: staan tot dan niet op de lijst. */
    pendingWithCareer: number;
    /** Nog niet bevestigd, zonder Career: krijgen de vraag misschien. */
    pendingWithoutCareer: number;
    via: Record<StudyConfirmationViaValue, number>;
    /** Bevestigd, maar zonder rij: van voor de registratie. */
    untracked: number;
    gate: RoundFunnel;
    onboarding: RoundFunnel;
    /** Career via het bevestigingsscherm aangeduid, zonder rij voor dit jaar. */
    gateOptInsBeforeTracking: number;
    /** De vroegste geregistreerde bevestiging, of `null`. */
    trackedSince: Date | null;
  };

  segments: { years: SegmentRow[]; programmes: SegmentRow[] };

  charts: {
    /** Nieuwe opt-ins per dag, per herkomst, de laatste {@link RECENT_DAYS} dagen. */
    optInsPerDay: DailySeries;
    /** Bevestigingen per dag, per scherm, sinds de start van het academiejaar. */
    confirmationsPerDay: DailySeries;
    /** Career aan en op de lijst, per dag. */
    list: { days: string[]; total: History; onList: History; measuredSince: string | null };
  };
};

type CountRow = { day: string; key: string; count: bigint };
type SegmentSqlRow = {
  key: string;
  confirmed: bigint;
  on_list: bigint;
  asked: bigint;
  chosen: bigint;
};

function toMap(rows: CountRow[], key: string): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    if (row.key !== key) continue;
    map.set(row.day, (map.get(row.day) ?? 0) + Number(row.count));
  }
  return map;
}

export async function careerStats(now: Date = new Date()): Promise<CareerStats> {
  const year = currentStudyYear(now);
  const confirmationYear = studyConfirmationYear(now);
  const today = ymdKey(brusselsYMD(now));
  // Het academiejaar begint op 14 september; de grafiek van de ronde ook.
  const roundStart = `${year}-09-14`;
  const roundEnd = today < roundStart ? roundStart : today;

  const ONBOARDED: Prisma.UserWhereInput = { onboardedAt: { not: null } };
  const SUBSCRIBED: Prisma.UserWhereInput = { mailUnsubscribedAt: null };

  const [
    listTotal,
    careerAtFaculty,
    onList,
    awaitingConfirmation,
    unsubscribed,
    studentAccounts,
    ourStudents,
    ourStudentsWithCareer,
    notAtFaculty,
    notOnboarded,
    noProgramme,
    firwStudents,
    firwOurStudents,
    grouped,
    roundStudents,
    roundConfirmed,
    pendingWithCareer,
    pendingWithoutCareer,
    confirmations,
    trackedConfirmed,
    gateOptInsBeforeTracking,
    trackedSince,
  ] = await Promise.all([
    prisma.user.count({ where: { ...LIVE, ...HAS_CAREER } }),
    prisma.user.count({ where: CAREER_AT_FACULTY }),
    prisma.user.count({ where: listWhere("CAREER") }),
    prisma.user.count({
      where: { ...CAREER_AT_FACULTY, ...SUBSCRIBED, ...notConfirmedFor(confirmationYear) },
    }),
    prisma.user.count({ where: { ...CAREER_AT_FACULTY, mailUnsubscribedAt: { not: null } } }),
    prisma.user.count({ where: STUDENT }),
    prisma.user.count({ where: OUR_STUDENTS }),
    prisma.user.count({ where: { ...OUR_STUDENTS, ...HAS_CAREER } }),
    prisma.user.count({ where: { ...STUDENT, notAtFaculty: true } }),
    prisma.user.count({
      where: { ...STUDENT, notAtFaculty: false, ...NO_PROGRAMME, onboardedAt: null },
    }),
    prisma.user.count({ where: { ...STUDENT, notAtFaculty: false, ...NO_PROGRAMME, ...ONBOARDED } }),
    prisma.user.count({ where: { ...LIVE, firwStudent: true } }),
    prisma.user.count({ where: { ...OUR_STUDENTS, firwStudent: true } }),
    prisma.user.groupBy({
      by: ["careerOptInSource"],
      where: { ...LIVE, ...HAS_CAREER },
      _count: { _all: true },
    }),
    prisma.user.count({ where: { ...STUDENT, ...ONBOARDED } }),
    prisma.user.count({ where: { ...STUDENT, ...ONBOARDED, studyConfirmedYear: { gte: year } } }),
    prisma.user.count({
      where: { ...CAREER_AT_FACULTY, ...ONBOARDED, ...SUBSCRIBED, ...notConfirmedFor(year) },
    }),
    prisma.user.count({
      where: {
        ...STUDENT,
        ...ONBOARDED,
        ...SUBSCRIBED,
        notAtFaculty: false,
        NOT: HAS_CAREER,
        ...notConfirmedFor(year),
      },
    }),
    prisma.studyConfirmation.groupBy({
      by: ["via", "careerBefore", "careerAsked", "careerChosen"],
      where: { year },
      _count: { _all: true },
    }),
    // Enkel rijen van wie nu nog als bevestigd telt, zodat "niet geregistreerd"
    // het echte verschil is en niet negatief kan worden door een lid dat
    // intussen gedeactiveerd is.
    prisma.studyConfirmation.count({
      where: {
        year,
        user: { ...STUDENT, ...ONBOARDED, studyConfirmedYear: { gte: year } },
      },
    }),
    prisma.user.count({
      where: {
        ...LIVE,
        ...HAS_CAREER,
        careerOptInSource: "STUDY_CONFIRMATION",
        studyConfirmations: { none: { year } },
      },
    }),
    prisma.studyConfirmation.findFirst({
      orderBy: { confirmedAt: "asc" },
      select: { confirmedAt: true },
    }),
  ]);

  const bySource: CareerStats["bySource"] = { ONBOARDING: 0, ACCOUNT: 0, STUDY_CONFIRMATION: 0 };
  for (const row of grouped) {
    bySource[row.careerOptInSource ?? "ONBOARDING"] += row._count._all;
  }

  const via: Record<StudyConfirmationViaValue, number> = {
    CONFIRMATION: 0,
    ONBOARDING: 0,
    ACCOUNT: 0,
  };
  const funnel = (): RoundFunnel => ({ total: 0, before: 0, asked: 0, chosen: 0 });
  const gate = funnel();
  const onboarding = funnel();
  for (const row of confirmations) {
    const n = row._count._all;
    via[row.via] += n;
    const target = row.via === "CONFIRMATION" ? gate : row.via === "ONBOARDING" ? onboarding : null;
    if (!target) continue;
    target.total += n;
    if (row.careerBefore) target.before += n;
    if (row.careerAsked) target.asked += n;
    if (row.careerChosen) target.chosen += n;
  }

  const [segments, charts] = await Promise.all([
    careerSegments(year),
    careerCharts({ year, today, roundStart, roundEnd }),
  ]);

  return {
    year,
    confirmationYear,
    list: {
      total: listTotal,
      notAtFaculty: listTotal - careerAtFaculty,
      awaitingConfirmation,
      unsubscribed,
      onList,
    },
    reach: {
      studentAccounts,
      notOnboarded,
      notAtFaculty,
      noProgramme,
      ourStudents,
      ourStudentsWithCareer,
      // Zonder studenten geen verhouding: 0/0 is hier 0% en geen NaN op het scherm.
      ourStudentsShare: ourStudents === 0 ? 0 : ourStudentsWithCareer / ourStudents,
      firwStudents,
      firwOurStudents,
    },
    bySource,
    round: {
      students: roundStudents,
      confirmed: roundConfirmed,
      pending: roundStudents - roundConfirmed,
      pendingWithCareer,
      pendingWithoutCareer,
      via,
      untracked: Math.max(0, roundConfirmed - trackedConfirmed),
      gate,
      onboarding,
      gateOptInsBeforeTracking,
      trackedSince: trackedSince?.confirmedAt ?? null,
    },
    segments,
    charts,
  };
}

/**
 * Per studiejaar en per richting: hoeveel van onze studenten die voor dit jaar
 * bevestigden op de lijst staan, en wat het bevestigingsscherm er opleverde.
 *
 * Enkel wie bevestigde, want enkel hun studiejaar is dat van dit jaar; wie nog
 * moet bevestigen, staat nog met het jaar van vorig jaar in het profiel. Een lid
 * met meerdere jaren of richtingen telt in elk ervan, net als in de deellijsten.
 */
async function careerSegments(year: number): Promise<CareerStats["segments"]> {
  const [years, programmes] = await Promise.all([
    prisma.$queryRaw<SegmentSqlRow[]>`
      WITH members AS (
        SELECT
          ('CAREER' = ANY(u."mailCategories") AND u."mailUnsubscribedAt" IS NULL) AS on_list,
          CASE WHEN cardinality(u."studyYears") = 0 THEN ARRAY['NONE']::text[]
               ELSE u."studyYears"::text[] END AS keys
        FROM "User" u
        WHERE u.active AND u."deletedAt" IS NULL AND u."isStudent" AND NOT u."notAtFaculty"
          AND cardinality(u."studyProgrammes") > 0 AND u."studyConfirmedYear" >= ${year}
      ),
      gate AS (
        SELECT
          c."careerAsked" AS asked,
          c."careerChosen" AS chosen,
          CASE WHEN cardinality(c."studyYears") = 0 THEN ARRAY['NONE']::text[]
               ELSE c."studyYears"::text[] END AS keys
        FROM "StudyConfirmation" c
        WHERE c.year = ${year} AND c.via = 'CONFIRMATION'
      ),
      m AS (SELECT k AS key, count(*) AS confirmed, count(*) FILTER (WHERE on_list) AS on_list
            FROM members, unnest(keys) AS k GROUP BY k),
      g AS (SELECT k AS key, count(*) FILTER (WHERE asked) AS asked, count(*) FILTER (WHERE chosen) AS chosen
            FROM gate, unnest(keys) AS k GROUP BY k)
      SELECT COALESCE(m.key, g.key) AS key,
             COALESCE(m.confirmed, 0) AS confirmed, COALESCE(m.on_list, 0) AS on_list,
             COALESCE(g.asked, 0) AS asked, COALESCE(g.chosen, 0) AS chosen
      FROM m FULL OUTER JOIN g ON m.key = g.key
    `,
    prisma.$queryRaw<SegmentSqlRow[]>`
      WITH members AS (
        SELECT
          ('CAREER' = ANY(u."mailCategories") AND u."mailUnsubscribedAt" IS NULL) AS on_list,
          u."studyProgrammes"::text[] AS keys
        FROM "User" u
        WHERE u.active AND u."deletedAt" IS NULL AND u."isStudent" AND NOT u."notAtFaculty"
          AND cardinality(u."studyProgrammes") > 0 AND u."studyConfirmedYear" >= ${year}
      ),
      gate AS (
        SELECT c."careerAsked" AS asked, c."careerChosen" AS chosen, c."studyProgrammes"::text[] AS keys
        FROM "StudyConfirmation" c
        WHERE c.year = ${year} AND c.via = 'CONFIRMATION'
      ),
      m AS (SELECT k AS key, count(*) AS confirmed, count(*) FILTER (WHERE on_list) AS on_list
            FROM members, unnest(keys) AS k GROUP BY k),
      g AS (SELECT k AS key, count(*) FILTER (WHERE asked) AS asked, count(*) FILTER (WHERE chosen) AS chosen
            FROM gate, unnest(keys) AS k GROUP BY k)
      SELECT COALESCE(m.key, g.key) AS key,
             COALESCE(m.confirmed, 0) AS confirmed, COALESCE(m.on_list, 0) AS on_list,
             COALESCE(g.asked, 0) AS asked, COALESCE(g.chosen, 0) AS chosen
      FROM m FULL OUTER JOIN g ON m.key = g.key
    `,
  ]);

  const rows = (list: SegmentSqlRow[]): SegmentRow[] =>
    list.map((row) => ({
      key: row.key,
      confirmed: Number(row.confirmed),
      onList: Number(row.on_list),
      asked: Number(row.asked),
      chosen: Number(row.chosen),
    }));
  return { years: rows(years), programmes: rows(programmes) };
}

async function careerCharts(input: {
  year: number;
  today: string;
  roundStart: string;
  roundEnd: string;
}): Promise<CareerStats["charts"]> {
  const { year, today, roundStart, roundEnd } = input;

  const [optIns, confirmations, history] = await Promise.all([
    // Elke lopende opt-in op zijn Brusselse dag, per herkomst. Zonder herkomst
    // is het een onboarding van voor 17 september 2026 (zie `CareerSource`).
    prisma.$queryRaw<CountRow[]>`
      SELECT
        to_char((COALESCE(u."careerOptInAt", u."onboardedAt", u."createdAt") AT TIME ZONE 'Europe/Brussels')::date, 'YYYY-MM-DD') AS day,
        COALESCE(u."careerOptInSource"::text, 'ONBOARDING') AS key,
        count(*) AS count
      FROM "User" u
      WHERE u.active AND u."deletedAt" IS NULL AND 'CAREER' = ANY(u."mailCategories")
      GROUP BY 1, 2
    `,
    prisma.$queryRaw<CountRow[]>`
      SELECT
        to_char((c."confirmedAt" AT TIME ZONE 'Europe/Brussels')::date, 'YYYY-MM-DD') AS day,
        c.via::text AS key,
        count(*) AS count
      FROM "StudyConfirmation" c
      WHERE c.year = ${year}
      GROUP BY 1, 2
    `,
    readHistory([HISTORY_KEYS.careerOptIns, HISTORY_KEYS.list("CAREER")]),
  ]);

  // Opt-ins per dag: een vast venster, zodat de staven niet dunner worden
  // naarmate de site ouder wordt.
  const recent = dayRange(daysBefore(today, RECENT_DAYS - 1), today);
  const sources: CareerSource[] = ["ONBOARDING", "STUDY_CONFIRMATION", "ACCOUNT"];
  const optInsPerDay: DailySeries = {
    days: recent,
    series: Object.fromEntries(
      sources.map((source) => {
        const perDay = toMap(optIns, source);
        return [source, recent.map((day) => perDay.get(day) ?? 0)];
      }),
    ),
  };

  const roundDays = dayRange(roundStart, roundEnd);
  const vias: StudyConfirmationViaValue[] = ["ONBOARDING", "CONFIRMATION", "ACCOUNT"];
  const confirmationsPerDay: DailySeries = {
    days: roundDays,
    series: Object.fromEntries(
      vias.map((v) => {
        const perDay = toMap(confirmations, v);
        return [v, roundDays.map((day) => perDay.get(day) ?? 0)];
      }),
    ),
  };

  // Het verloop van de lijst loopt van de eerste opt-in tot vandaag. Het
  // gemeten stuk komt uit de dagelijkse telling; wat ervoor ligt, is voor
  // "Career aan" op te tellen uit de opt-in-datums, voor "op de lijst" niet
  // (de bevestigingsdatum is van voor de registratie nergens bewaard).
  const allOptIns = new Map<string, number>();
  for (const row of optIns) allOptIns.set(row.day, (allOptIns.get(row.day) ?? 0) + Number(row.count));
  const measuredTotal = history.get(HISTORY_KEYS.careerOptIns) ?? new Map<string, number>();
  const measuredList = history.get(HISTORY_KEYS.list("CAREER")) ?? new Map<string, number>();
  const firstOptIn = [...allOptIns.keys()].sort()[0] ?? today;
  const firstMeasured = [...measuredTotal.keys(), ...measuredList.keys()].sort()[0] ?? null;
  const start = [firstOptIn, firstMeasured ?? today].sort()[0];
  const listDays = dayRange(start, today);
  const reconstructed = cumulative(listDays, allOptIns, totalBefore(allOptIns, start));

  return {
    optInsPerDay,
    confirmationsPerDay,
    list: {
      days: listDays,
      total: joinHistory(listDays, measuredTotal, reconstructed),
      onList: joinHistory(listDays, measuredList, null),
      measuredSince: firstMeasured,
    },
  };
}

/** "37%" uit 0.3712. Hele procenten: het is een verhouding, geen meting. */
export function formatShare(share: number, locale: "nl" | "en"): string {
  return new Intl.NumberFormat(locale === "nl" ? "nl-BE" : "en-GB", {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(share);
}
