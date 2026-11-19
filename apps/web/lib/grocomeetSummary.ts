/**
 * Wat er op de grocomeets van een werkingsjaar al gegeten en gedronken is, voor
 * de herbegroting van Groep 5: per vergadering, per semester en per product.
 *
 * Zuivere logica, zonder prisma: `lib/meetingAdmin.ts` haalt de rijen op, het
 * scherm en de Excel-export (`lib/grocomeetSummaryXlsx.ts`) tonen het resultaat.
 *
 * Twee bronnen, bewust apart gehouden omdat de herbegroting moet kunnen kiezen:
 *
 * - **Formulier**: wat via /grocomeet voor de vergadering besteld werd, één
 *   broodje en één drankje per persoon (`MeetingReservation`).
 * - **GM-doos**: wat een groco die dag zelf bij Theokot bestelde en in de doos
 *   van de GM meeging (`TheokotOrder.grocomeetId`).
 *
 * Wat niet meetelt: een ongeldig gemaakte inschrijving (daar stond geen broodje
 * tegenover), een geannuleerde of no-show-bestelling bij Theokot, en een
 * vergadering die nog niet begonnen is.
 */

import type { MeetingReservationStatus, TheokotOrderStatus } from "@prisma/client";

import { offeringNameKey, reservationTotalCents, type Semester } from "./meetings";

export type SummaryReservation = {
  status: MeetingReservationStatus;
  itemName: string | null;
  itemPriceCents: number;
  drinkName: string | null;
  drinkPriceCents: number;
  external?: boolean;
};

export type SummaryBoxOrder = {
  status: TheokotOrderStatus;
  lines: Array<{ name: string; quantity: number; unitPriceCents: number }>;
};

export type SummaryMeeting = {
  id: string;
  startsAt: Date;
  semester: number;
  reservations: SummaryReservation[];
  boxOrders: SummaryBoxOrder[];
};

/** Dezelfde statussen als in het geldoverzicht van de GM (`loadGrocomeetDebts`). */
const BOX_STATUSES: ReadonlySet<TheokotOrderStatus> = new Set(["RESERVED", "PICKED_UP"]);

export type SummarySource = "FORM_ITEM" | "FORM_DRINK" | "BOX";

export type SummaryCounts = {
  /** Broodjes via het formulier. */
  formItems: number;
  /** Drankjes via het formulier. */
  formDrinks: number;
  formCents: number;
  /** Stuks uit de GM-doos (een bestelling kan meer dan één broodje hebben). */
  boxItems: number;
  boxCents: number;
  totalCents: number;
};

export type SummaryMeetingRow = SummaryCounts & {
  id: string;
  startsAt: Date;
  semester: Semester;
  /** Iedereen die ingeschreven was, ook zonder bestelling. */
  attendees: number;
};

export type SummaryProductRow = {
  source: SummarySource;
  name: string;
  count: number;
  cents: number;
};

/** Eén regel per vergadering per product: de ruwe rij voor een draaitabel. */
export type SummaryDetailRow = SummaryProductRow & {
  meetingId: string;
  startsAt: Date;
  semester: Semester;
};

export type GrocomeetSummary = {
  meetings: SummaryMeetingRow[];
  semesters: Array<SummaryCounts & { semester: Semester; meetings: number }>;
  year: SummaryCounts & { meetings: number };
  products: SummaryProductRow[];
  details: SummaryDetailRow[];
  /** Hoeveel vergaderingen er dit jaar nog komen en dus niet meetellen. */
  upcoming: number;
};

function emptyCounts(): SummaryCounts {
  return { formItems: 0, formDrinks: 0, formCents: 0, boxItems: 0, boxCents: 0, totalCents: 0 };
}

function addCounts(target: SummaryCounts, source: SummaryCounts): void {
  target.formItems += source.formItems;
  target.formDrinks += source.formDrinks;
  target.formCents += source.formCents;
  target.boxItems += source.boxItems;
  target.boxCents += source.boxCents;
  target.totalCents += source.totalCents;
}

const SOURCE_ORDER: Record<SummarySource, number> = { FORM_ITEM: 0, FORM_DRINK: 1, BOX: 2 };

function normalizeSemester(value: number): Semester {
  return value === 2 ? 2 : 1;
}

/**
 * Telt de vergaderingen op die voor `now` begonnen. Een product wordt op naam
 * samengeteld (`offeringNameKey`), want hetzelfde broodje heeft op elke
 * verkoopdag een ander id; de naam die het eerst voorkomt, wordt getoond.
 */
export function summarizeGrocomeets(meetings: readonly SummaryMeeting[], now: Date): GrocomeetSummary {
  const past = meetings
    .filter((meeting) => meeting.startsAt.getTime() <= now.getTime())
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  const rows: SummaryMeetingRow[] = [];
  const details: SummaryDetailRow[] = [];
  const products = new Map<string, SummaryProductRow>();

  for (const meeting of past) {
    const semester = normalizeSemester(meeting.semester);
    const counts = emptyCounts();
    const perMeeting = new Map<string, SummaryProductRow>();

    const count = (source: SummarySource, name: string, quantity: number, cents: number) => {
      const key = `${source}:${offeringNameKey(name)}`;
      for (const map of [perMeeting, products]) {
        const row = map.get(key) ?? { source, name: name.trim(), count: 0, cents: 0 };
        row.count += quantity;
        row.cents += cents;
        map.set(key, row);
      }
    };

    let attendees = 0;
    for (const reservation of meeting.reservations) {
      if (reservation.status !== "ACTIVE") continue;
      attendees += 1;
      if (reservation.itemName) {
        // Een extern broodje (enkel bij een big bureau) staat niet op deze rekening.
        const cents = reservation.external ? 0 : reservation.itemPriceCents;
        counts.formItems += 1;
        count("FORM_ITEM", reservation.itemName, 1, cents);
      }
      if (reservation.drinkName) {
        counts.formDrinks += 1;
        count("FORM_DRINK", reservation.drinkName, 1, reservation.drinkPriceCents);
      }
      counts.formCents += reservationTotalCents(reservation);
    }

    for (const order of meeting.boxOrders) {
      if (!BOX_STATUSES.has(order.status)) continue;
      for (const line of order.lines) {
        if (line.quantity <= 0) continue;
        const cents = line.quantity * line.unitPriceCents;
        counts.boxItems += line.quantity;
        counts.boxCents += cents;
        count("BOX", line.name, line.quantity, cents);
      }
    }
    counts.totalCents = counts.formCents + counts.boxCents;

    rows.push({ id: meeting.id, startsAt: meeting.startsAt, semester, attendees, ...counts });
    for (const product of sortProducts([...perMeeting.values()])) {
      details.push({ ...product, meetingId: meeting.id, startsAt: meeting.startsAt, semester });
    }
  }

  const semesters = ([1, 2] as const)
    .map((semester) => {
      const inSemester = rows.filter((row) => row.semester === semester);
      const totals = emptyCounts();
      for (const row of inSemester) addCounts(totals, row);
      return { semester, meetings: inSemester.length, ...totals };
    })
    .filter((row) => row.meetings > 0);

  const year = emptyCounts();
  for (const row of rows) addCounts(year, row);

  return {
    meetings: rows,
    semesters,
    year: { meetings: rows.length, ...year },
    products: sortProducts([...products.values()]),
    details,
    upcoming: meetings.length - past.length,
  };
}

/** Per bron (broodjes, drankjes, GM-doos), daarbinnen het meest besteld eerst. */
function sortProducts(rows: SummaryProductRow[]): SummaryProductRow[] {
  return rows.sort(
    (a, b) =>
      SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source] ||
      b.count - a.count ||
      a.name.localeCompare(b.name, "nl"),
  );
}

export function summarySourceLabel(source: SummarySource, nl: boolean): string {
  switch (source) {
    case "FORM_ITEM":
      return nl ? "Broodje (formulier)" : "Sandwich (form)";
    case "FORM_DRINK":
      return nl ? "Drankje (formulier)" : "Drink (form)";
    case "BOX":
      return nl ? "GM-doos (Theokot)" : "GM box (Theokot)";
  }
}
