import { describe, expect, it, vi } from "vitest";
import {
  hasUpcomingMoment,
  leadMoment,
  momentDayParts,
  momentStrip,
  momentStripRest,
  momentsEnvelope,
  momentsSummary,
  nextOccurrenceAt,
  sharedMomentTime,
} from "@/lib/calendar/moments";

/**
 * Een evenement met losse momenten: een loopweek met elke dag een loopje.
 *
 * De regel die hier bewaakt wordt, is dat zo'n evenement **nooit** één afspraak
 * over de hele week wordt. Precies dat maakte het verschil: als één VEVENT van
 * maandag 18u tot zondag 19u staat er in de agenda van elk lid een blok dat een
 * week lang alle uren bezet houdt.
 */

const findMany = vi.fn();

vi.mock("@vtk/db", () => ({
  prisma: {
    calendarEvent: { findMany: (...args: unknown[]) => findMany(...args) },
    shiftParticipant: { findMany: async () => [] },
  },
}));

const { buildFeed } = await import("@/lib/calendar/feeds");

function moment(day: string, from: string, to: string, label: string | null = null) {
  return {
    start: new Date(`2026-10-${day}T${from}:00+02:00`),
    end: new Date(`2026-10-${day}T${to}:00+02:00`),
    label,
  };
}

const NOW = new Date("2026-10-01T09:00:00.000Z");

/** De regels van een .ics, met de vervolgregels teruggeplakt. */
function lines(ics: string): string[] {
  const out: string[] = [];
  for (const line of ics.split("\r\n")) {
    if (line.startsWith(" ") && out.length > 0) out[out.length - 1] += line.slice(1);
    else out.push(line);
  }
  return out;
}

describe("momentsEnvelope", () => {
  it("spans the first start and the last end", () => {
    const envelope = momentsEnvelope([
      moment("13", "18:00", "19:00"),
      moment("12", "18:00", "19:00"),
      moment("14", "18:00", "19:00"),
    ]);
    expect(envelope?.start).toEqual(new Date("2026-10-12T18:00:00+02:00"));
    expect(envelope?.end).toEqual(new Date("2026-10-14T19:00:00+02:00"));
  });

  it("has nothing to span without moments", () => {
    expect(momentsEnvelope([])).toBeNull();
  });
});

describe("momentsSummary", () => {
  const zone = "Europe/Brussels";

  it("summarises a shared time instead of repeating it", () => {
    const week = ["12", "13", "14"].map((day) => moment(day, "18:00", "19:00"));
    expect(sharedMomentTime(week, zone)).toBe("18:00");
    expect(momentsSummary(week, "nl", zone)).toBe("telkens 18:00");
    expect(momentsSummary(week, "en", zone)).toBe("each time 18:00");
  });

  it("falls back to the count as soon as one moment differs", () => {
    const mixed = [moment("12", "18:00", "19:00"), moment("13", "20:00", "21:00")];
    expect(sharedMomentTime(mixed, zone)).toBeNull();
    expect(momentsSummary(mixed, "nl", zone)).toBe("2 momenten");
  });
});

describe("the next occurrence of an event", () => {
  const week = ["12", "13", "14"].map((day) => moment(day, "18:00", "19:00"));
  const loopweek = { start: week[0]!.start, moments: week };

  it("is the next moment once the first one is over", () => {
    const wednesday = new Date("2026-10-14T09:00:00+02:00");
    expect(leadMoment(week, wednesday)?.start).toEqual(week[2]!.start);
    expect(nextOccurrenceAt(loopweek, wednesday)).toEqual(week[2]!.start);
    expect(hasUpcomingMoment(loopweek, wednesday)).toBe(true);
  });

  it("stays running as long as one moment is still to come", () => {
    // De envelop begon maandag, dus "start >= nu" zou het evenement dinsdag al
    // uit de lijst met aankomende evenementen halen terwijl er nog twee loopjes
    // volgen.
    const tuesday = new Date("2026-10-13T09:00:00+02:00");
    expect(loopweek.start < tuesday).toBe(true);
    expect(hasUpcomingMoment(loopweek, tuesday)).toBe(true);
  });

  it("is over once the last moment has ended", () => {
    const after = new Date("2026-10-15T09:00:00+02:00");
    expect(hasUpcomingMoment(loopweek, after)).toBe(false);
    // Voorbij blijft het laatste moment het gezicht van de kaart.
    expect(nextOccurrenceAt(loopweek, after)).toEqual(week[2]!.start);
  });

  it("falls back to the start for an event without moments", () => {
    const now = new Date("2026-10-10T09:00:00+02:00");
    const gala = { start: new Date("2026-10-21T20:00:00+02:00") };
    expect(nextOccurrenceAt(gala, now)).toEqual(gala.start);
    expect(hasUpcomingMoment(gala, now)).toBe(true);
  });
});

describe("the day strip of a series", () => {
  const zone = "Europe/Brussels";
  const week = ["12", "13", "14", "15", "16", "17", "18"].map((day) =>
    moment(day, "18:00", "19:00"),
  );

  it("only shows what is still to come, with the next day marked", () => {
    // Woensdag, na het loopje van dinsdag: de eerste twee dagen zijn voorbij en
    // horen niet meer op de strip. Zo schuift ze mee met de rij en met de datum
    // op de kaart, die allebei al op het eerstvolgende moment staan.
    const wednesday = new Date("2026-10-14T09:00:00+02:00");
    const strip = momentStrip(week.slice(0, 4), wednesday);
    expect(strip?.days.map((day) => day.start.getDate())).toEqual([14, 15]);
    expect(strip?.days.map((day) => day.next)).toEqual([true, false]);
    expect(strip?.rest).toBe(0);
  });

  it("caps the strip and says where the series ends", () => {
    const monday = new Date("2026-10-12T09:00:00+02:00");
    const strip = momentStrip(week, monday, 6);
    expect(strip?.days).toHaveLength(6);
    expect(strip?.rest).toBe(1);
    expect(momentStripRest(strip!, "nl", zone)).toBe("+1 tot zo 18 okt");
    expect(momentStripRest(strip!, "en", zone)).toBe("+1 until Sun 18 Oct");
  });

  it("shows the last days once everything is over, without a next", () => {
    // Een kaart in een voorbije week toont nog altijd wanneer de reeks liep;
    // niets tonen zou daar een gewoon evenement van maken.
    const after = new Date("2026-10-20T09:00:00+02:00");
    const strip = momentStrip(week, after, 3);
    expect(strip?.days.map((day) => day.start.getDate())).toEqual([16, 17, 18]);
    expect(strip?.days.some((day) => day.next)).toBe(false);
    expect(strip?.rest).toBe(0);
  });

  it("has no strip for an event that happens once", () => {
    const now = new Date("2026-10-10T09:00:00+02:00");
    expect(momentStrip([], now)).toBeNull();
    expect(momentStrip([moment("12", "18:00", "19:00")], now)).toBeNull();
  });

  it("writes a day as a weekday above its number", () => {
    expect(momentDayParts(week[0]!.start, "nl", zone)).toEqual({ weekday: "ma", day: "12" });
    expect(momentDayParts(week[0]!.start, "en", zone)).toEqual({ weekday: "Mon", day: "12" });
  });
});

describe("the calendar feed for an event with moments", () => {
  const event = {
    id: "evt1",
    slug: "loopweek-2026",
    titleNl: "Loopweek",
    titleEn: "Running week",
    descriptionNl: null,
    descriptionEn: null,
    location: "Sportkot",
    start: new Date("2026-10-12T18:00:00+02:00"),
    end: new Date("2026-10-14T21:30:00+02:00"),
    allDay: false,
    updatedAt: new Date("2026-10-01T08:00:00.000Z"),
    categories: [],
    moments: [
      moment("12", "18:00", "19:00"),
      moment("13", "18:00", "19:00"),
      moment("14", "18:00", "19:00"),
      moment("14", "20:00", "21:30", "Nachtloop"),
    ],
  };

  it("writes one appointment per moment instead of one block over the week", async () => {
    findMany.mockResolvedValue([event]);
    const feed = lines(await buildFeed({ kind: "all" }, "nl", NOW));

    expect(feed.filter((line) => line === "BEGIN:VEVENT")).toHaveLength(4);
    expect(feed.filter((line) => line.startsWith("DTSTART:"))).toEqual([
      "DTSTART:20261012T160000Z",
      "DTSTART:20261013T160000Z",
      "DTSTART:20261014T160000Z",
      "DTSTART:20261014T180000Z",
    ]);
    // Elke afspraak eindigt op haar eigen dag: geen enkele loopt van de eerste
    // dag tot de laatste, wat de envelop op het evenement wel doet.
    expect(feed.filter((line) => line.startsWith("DTEND:"))).toEqual([
      "DTEND:20261012T170000Z",
      "DTEND:20261013T170000Z",
      "DTEND:20261014T170000Z",
      "DTEND:20261014T193000Z",
    ]);
  });

  it("keeps the uid stable per day and distinct within a day", async () => {
    findMany.mockResolvedValue([event]);
    const feed = lines(await buildFeed({ kind: "all" }, "nl", NOW));
    const uids = feed.filter((line) => line.startsWith("UID:"));
    expect(uids).toEqual([
      "UID:evt1-20261012@vtk.be",
      "UID:evt1-20261013@vtk.be",
      "UID:evt1-20261014@vtk.be",
      "UID:evt1-20261014-2@vtk.be",
    ]);
    expect(new Set(uids).size).toBe(uids.length);
  });

  it("puts the name of a moment behind the title, where an agenda app shows it", async () => {
    findMany.mockResolvedValue([event]);
    const feed = lines(await buildFeed({ kind: "all" }, "nl", NOW));
    expect(feed.filter((line) => line.startsWith("SUMMARY:"))).toEqual([
      "SUMMARY:Loopweek",
      "SUMMARY:Loopweek",
      "SUMMARY:Loopweek",
      "SUMMARY:Loopweek: Nachtloop",
    ]);
  });

  it("stays one appointment for an event without moments", async () => {
    findMany.mockResolvedValue([{ ...event, moments: [] }]);
    const feed = lines(await buildFeed({ kind: "all" }, "nl", NOW));
    expect(feed.filter((line) => line === "BEGIN:VEVENT")).toHaveLength(1);
    expect(feed).toContain("UID:evt1@vtk.be");
  });
});
