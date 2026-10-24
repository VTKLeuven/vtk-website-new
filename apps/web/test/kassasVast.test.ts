import { describe, expect, it, vi } from "vitest";
import type { SessionPayload } from "@vtk/auth";

vi.mock("@vtk/db", () => ({ prisma: {} }));
vi.mock("@/lib/session", () => ({ getCurrentSession: vi.fn(), requireSession: vi.fn() }));

import {
  ledgerYearOf,
  ledgerYearResultCents,
  quarterLabel,
  quarterOf,
  quarterResult,
  resultsPerCheckpoint,
  sortEntries,
  withinPostWindow,
  type PermanentEntry,
  type PermanentEntryKind,
  type Quarter,
} from "@/lib/kassas/permanent";
import { accessFor, brusselsToday, canEditPermanentEntry, permanentTabLabel } from "@/lib/kassas/server";

let sequence = 0;

/** Een regel zoals ze uit de database komt; bonnen aan € 1,20 zoals in CUDITHEOFAK. */
function entry(
  date: string,
  kind: PermanentEntryKind,
  cashCents: number,
  extra: Partial<PermanentEntry> & { at?: string } = {},
): PermanentEntry {
  sequence += 1;
  return {
    id: `e${sequence}`,
    kind,
    date: new Date(`${date}T00:00:00.000Z`),
    createdAt: new Date(extra.at ?? `${date}T12:00:00.000Z`),
    cashCents,
    shiftVouchers: 0,
    elixirVouchers: 0,
    shiftVoucherValueCents: 120,
    elixirVoucherValueCents: 120,
    closesRegister: false,
    ...extra,
  };
}

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const Q3_2026: Quarter = { year: 2026, quarter: 3 };
const Q4_2026: Quarter = { year: 2026, quarter: 4 };

function resultOf(entries: PermanentEntry[], quarter: Quarter, today: string): number | string {
  const result = quarterResult(sortEntries(entries), quarter, day(today));
  return result.state === "done" ? result.resultCents : result.state;
}

describe("vaste kassa's: winst per kwartaal", () => {
  // De voorbeelden van het ontwerpbord, zodat het scherm en de rekensom kloppen.
  const theokot = [
    entry("2026-09-22", "HANDED_OUT", 30_000),
    entry("2026-09-30", "COUNT", 61_240, { shiftVouchers: 14 }),
    entry("2026-10-14", "RETURNED", 40_000),
    entry("2026-11-18", "RETURNED", 50_000),
    entry("2026-12-02", "HANDED_OUT", 5_000),
    entry("2026-12-19", "COUNT", 45_510, { shiftVouchers: 61 }),
  ];

  it("rekent binnengekomen min uitgegaan, met de bonnen aan hun waarde", () => {
    // 612,40 + 14 bonnen - 300 startkassa.
    expect(resultOf(theokot, Q3_2026, "2027-01-06")).toBe(32_920);
    // 455,10 + 61 bonnen + 900 terug - 629,20 opening - 50 meegegeven.
    expect(resultOf(theokot, Q4_2026, "2027-01-06")).toBe(74_910);
    expect(ledgerYearResultCents(sortEntries(theokot), 2026, day("2027-01-06"))).toBe(107_830);
  });

  it("onderscheidt een lopend kwartaal van een kwartaal zonder telling", () => {
    const fakbar = [
      entry("2026-09-23", "HANDED_OUT", 25_000),
      entry("2026-10-28", "RETURNED", 80_000),
      entry("2026-11-25", "RETURNED", 120_000),
      entry("2026-12-18", "COUNT", 70_260, { shiftVouchers: 25, elixirVouchers: 40 }),
    ];
    // Op 24 oktober stond enkel de startkassa er.
    const october = fakbar.slice(0, 1);
    expect(resultOf(october, Q3_2026, "2026-10-24")).toBe("missing");
    expect(resultOf(october, Q4_2026, "2026-10-24")).toBe("open");
    expect(resultOf(october, { year: 2027, quarter: 1 }, "2026-10-24")).toBe("future");
    // Zonder telling eind september schuift die winst mee naar het vierde kwartaal.
    expect(resultOf(fakbar, Q4_2026, "2027-01-06")).toBe(253_060);
  });

  it("verandert de som niet door een tussentijdse telling", () => {
    const cudi = [
      entry("2026-09-21", "HANDED_OUT", 20_000),
      entry("2026-09-30", "COUNT", 184_230),
      entry("2026-10-08", "RETURNED", 150_000),
      entry("2026-11-05", "COUNT", 39_810),
      entry("2026-12-22", "COUNT", 61_080),
    ];
    const sorted = sortEntries(cudi);
    const perCount = resultsPerCheckpoint(sorted);
    expect(perCount.get(cudi[3].id)?.resultCents).toBe(5_580);
    expect(perCount.get(cudi[4].id)?.resultCents).toBe(21_270);
    expect(resultOf(cudi, Q4_2026, "2027-01-06")).toBe(5_580 + 21_270);
  });

  it("zet de kassa op nul na een volledige teruggave", () => {
    const year = [
      entry("2026-09-22", "HANDED_OUT", 30_000),
      entry("2027-03-31", "COUNT", 50_000),
      entry("2027-06-28", "RETURNED", 60_000, { closesRegister: true }),
      entry("2027-09-20", "HANDED_OUT", 30_000),
      entry("2027-09-30", "COUNT", 40_000),
    ];
    expect(resultOf(year, { year: 2027, quarter: 2 }, "2027-10-10")).toBe(10_000);
    // Het nieuwe jaar begint van nul, niet van de telling van maart.
    expect(resultOf(year, { year: 2027, quarter: 3 }, "2027-10-10")).toBe(10_000);
  });

  it("volgt op dezelfde dag de volgorde van ingeven", () => {
    const sameDay = [
      entry("2026-12-31", "RETURNED", 10_000, { at: "2026-12-31T15:00:00.000Z" }),
      entry("2026-12-31", "COUNT", 50_000, { at: "2026-12-31T10:00:00.000Z" }),
      entry("2027-02-01", "COUNT", 45_000),
    ];
    // De afgifte van na de telling hoort bij de volgende periode, niet bij Q4.
    expect(resultOf(sameDay, Q4_2026, "2027-04-02")).toBe(50_000);
    expect(resultOf(sameDay, { year: 2027, quarter: 1 }, "2027-04-02")).toBe(45_000 + 10_000 - 50_000);
  });
});

describe("vaste kassa's: kwartalen en jaren", () => {
  it("noemt het kwartaal en zet juli tot juni in één kasboekjaar", () => {
    expect(quarterOf(day("2026-12-31"))).toEqual({ year: 2026, quarter: 4 });
    expect(quarterLabel(Q4_2026, true)).toBe("Oktober tot december 2026");
    expect(quarterLabel({ year: 2027, quarter: 1 }, false)).toBe("January to March 2027");
    expect(ledgerYearOf(day("2026-07-01"))).toBe(2026);
    expect(ledgerYearOf(day("2027-06-30"))).toBe(2026);
  });

  it("neemt vandaag op de Brusselse kalender", () => {
    // 23:30 UTC op 31 december is al nieuwjaar in Brussel.
    expect(brusselsToday(new Date("2026-12-31T23:30:00.000Z"))).toEqual(day("2027-01-01"));
  });
});

function session(groups: Array<{ id: string; code: string }>, permissions: string[]): SessionPayload {
  return {
    user: { id: "me", isSuperAdmin: false },
    permissions,
    groups: groups.map((group) => ({ ...group, nameNl: group.code === "THEOKOT" ? "Theokot" : group.code, nameEn: group.code })),
  } as unknown as SessionPayload;
}

describe("vaste kassa's: wie mag wat", () => {
  const today = day("2026-12-31");
  const theo = { id: "theo", code: "THEOKOT" };
  const post = accessFor(session([theo], ["cashRegisters.request"]));
  const manager = accessFor(session([], ["cashRegisters.manage"]));

  it("laat de post haar eigen tellingen van de laatste veertien dagen aanpassen", () => {
    expect(canEditPermanentEntry(post, { groupId: "theo", kind: "COUNT", date: day("2026-12-17") }, today)).toBe(true);
    expect(canEditPermanentEntry(post, { groupId: "theo", kind: "COUNT", date: day("2026-12-16") }, today)).toBe(false);
    expect(canEditPermanentEntry(post, { groupId: "fak", kind: "COUNT", date: today }, today)).toBe(false);
  });

  it("laat meegeven en teruggeven aan Beheer", () => {
    expect(canEditPermanentEntry(post, { groupId: "theo", kind: "RETURNED", date: today }, today)).toBe(false);
    expect(canEditPermanentEntry(manager, { groupId: "theo", kind: "RETURNED", date: day("2025-01-01") }, today)).toBe(true);
  });

  it("weigert een datum in de toekomst in het venster van de post", () => {
    expect(withinPostWindow(day("2027-01-01"), today)).toBe(false);
  });

  it("noemt het tabblad naar de eigen post", () => {
    expect(permanentTabLabel(post, "nl")).toBe("Kassa Theokot");
    expect(permanentTabLabel(manager, "nl")).toBe("Vaste kassa's");
    expect(permanentTabLabel(accessFor(session([{ id: "cult", code: "CULTUUR" }], ["cashRegisters.request"])), "nl")).toBeNull();
  });
});
