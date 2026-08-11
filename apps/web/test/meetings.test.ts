import { describe, expect, it } from "vitest";
import {
  DEFAULT_DRINK_PRICE_CENTS,
  DEFAULT_MEETING_DRINKS,
  meetingCloseAt,
  meetingPath,
  meetingWindowState,
  monthDays,
  offeringNameKey,
  parseMeetingDrinks,
  reservationTotalCents,
  semesterForDate,
  semesterMonths,
  semesterToPlan,
  suggestedMeetingDays,
  sumReservationTotals,
} from "@/lib/meetings";

describe("semesters", () => {
  it("legt semester 1 in het kalenderjaar van het werkingsjaar en semester 2 erna", () => {
    expect(semesterMonths(2026, 1)).toEqual([
      { year: 2026, month: 9 },
      { year: 2026, month: 10 },
      { year: 2026, month: 11 },
      { year: 2026, month: 12 },
      { year: 2027, month: 1 },
    ]);
    expect(semesterMonths(2026, 2)).toEqual([
      { year: 2027, month: 2 },
      { year: 2027, month: 3 },
      { year: 2027, month: 4 },
      { year: 2027, month: 5 },
      { year: 2027, month: 6 },
    ]);
  });

  it("rekent augustus tot en met januari bij semester 1", () => {
    expect(semesterForDate(new Date("2026-10-16T12:00:00Z"))).toBe(1);
    expect(semesterForDate(new Date("2027-01-20T12:00:00Z"))).toBe(1);
    expect(semesterForDate(new Date("2027-02-04T12:00:00Z"))).toBe(2);
    expect(semesterForDate(new Date("2027-06-30T12:00:00Z"))).toBe(2);
  });

  it("vraagt vanaf januari naar semester 2, ook al horen die dagen nog bij semester 1", () => {
    expect(semesterToPlan(new Date("2026-09-01T12:00:00Z"))).toBe(1);
    expect(semesterToPlan(new Date("2026-12-20T12:00:00Z"))).toBe(1);
    expect(semesterToPlan(new Date("2027-01-05T12:00:00Z"))).toBe(2);
    expect(semesterToPlan(new Date("2027-06-01T12:00:00Z"))).toBe(2);
  });
});

describe("monthDays", () => {
  it("geeft elke dag met haar ISO-weekdag", () => {
    const days = monthDays(2026, 10);
    expect(days).toHaveLength(31);
    expect(days[0]).toEqual({ value: "2026-10-01", day: 1, weekday: 4 }); // donderdag
    expect(days.at(-1)).toEqual({ value: "2026-10-31", day: 31, weekday: 6 }); // zaterdag
  });

  it("telt februari in een schrikkeljaar correct", () => {
    expect(monthDays(2028, 2)).toHaveLength(29);
  });
});

describe("suggestedMeetingDays", () => {
  it("stelt elke vrijdag voor als grocomeet", () => {
    const days = suggestedMeetingDays(2026, 1, "GROCOMEET");
    expect(days.length).toBeGreaterThan(15);
    for (const day of days) {
      const [year, month, dayOfMonth] = day.split("-").map(Number);
      expect(new Date(Date.UTC(year, month - 1, dayOfMonth)).getUTCDay()).toBe(5);
    }
  });

  it("stelt om de twee weken een donderdag voor als bureau", () => {
    const days = suggestedMeetingDays(2026, 1, "BUREAU");
    for (const day of days) {
      const [year, month, dayOfMonth] = day.split("-").map(Number);
      expect(new Date(Date.UTC(year, month - 1, dayOfMonth)).getUTCDay()).toBe(4);
    }
    // Veertien dagen tussen twee opeenvolgende voorstellen.
    const first = new Date(`${days[0]}T12:00:00Z`).getTime();
    const second = new Date(`${days[1]}T12:00:00Z`).getTime();
    expect(second - first).toBe(14 * 86400000);
  });
});

describe("bestelvenster", () => {
  const meeting = {
    startsAt: new Date("2026-10-16T10:45:00Z"), // 12:45 Brussel
    opensAt: null,
    useTheokot: true,
  };
  const session = { orderCloseAt: new Date("2026-10-16T08:30:00Z") }; // 10:30 Brussel

  it("volgt de deadline van de verkoopdag wanneer die er is", () => {
    expect(meetingCloseAt(meeting, session)).toEqual(session.orderCloseAt);
  });

  it("valt terug op het moment zelf zonder verkoopdag", () => {
    expect(meetingCloseAt(meeting, null)).toEqual(meeting.startsAt);
    expect(meetingCloseAt({ ...meeting, useTheokot: false }, session)).toEqual(meeting.startsAt);
  });

  it("is gesloten na de deadline en nog niet open voor `opensAt`", () => {
    expect(meetingWindowState(meeting, session, new Date("2026-10-16T07:00:00Z"))).toBe("OPEN");
    expect(meetingWindowState(meeting, session, new Date("2026-10-16T09:00:00Z"))).toBe("CLOSED");

    const withOpening = { ...meeting, opensAt: new Date("2026-10-10T00:00:00Z") };
    expect(meetingWindowState(withOpening, session, new Date("2026-10-09T12:00:00Z"))).toBe("UPCOMING");
    expect(meetingWindowState(withOpening, session, new Date("2026-10-11T12:00:00Z"))).toBe("OPEN");
  });
});

describe("drankjes", () => {
  it("valt terug op de standaardlijst en -prijs", () => {
    expect(parseMeetingDrinks(undefined)).toEqual({
      priceCents: DEFAULT_DRINK_PRICE_CENTS,
      items: DEFAULT_MEETING_DRINKS,
    });
    expect(parseMeetingDrinks({ items: [] }).items).toEqual(DEFAULT_MEETING_DRINKS);
    expect(parseMeetingDrinks({ priceCents: -5 }).priceCents).toBe(DEFAULT_DRINK_PRICE_CENTS);
  });

  it("leest een eigen lijst en prijs", () => {
    expect(parseMeetingDrinks({ priceCents: 120, items: [" Cola ", "Water", ""] })).toEqual({
      priceCents: 120,
      items: ["Cola", "Water"],
    });
  });
});

describe("naamsleutel en bedragen", () => {
  it("negeert hoofdletters en dubbele spaties bij het koppelen aan het aanbod", () => {
    expect(offeringNameKey("  Broodje  Kaas & Hesp ")).toBe("broodje kaas & hesp");
    expect(offeringNameKey("BROODJE KAAS & HESP")).toBe(offeringNameKey("broodje kaas & hesp"));
  });

  it("telt broodje en drankje samen", () => {
    expect(reservationTotalCents({ itemPriceCents: 260, drinkPriceCents: 100 })).toBe(360);
    expect(
      sumReservationTotals([
        { itemPriceCents: 260, drinkPriceCents: 100 },
        { itemPriceCents: 0, drinkPriceCents: 100 },
      ]),
    ).toBe(460);
  });
});

describe("meetingPath", () => {
  it("stuurt de grocomeet naar één pagina en een bureau naar zijn eigen link", () => {
    expect(meetingPath("GROCOMEET", "gm-2026-10-16")).toBe("/grocomeet");
    expect(meetingPath("BUREAU", "bureau-2026-10-15", "/en")).toBe("/en/bureau/bureau-2026-10-15");
  });
});
