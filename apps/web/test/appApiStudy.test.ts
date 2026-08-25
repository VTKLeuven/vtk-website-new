import { describe, expect, it, vi } from "vitest";

/**
 * Studietijd meten.
 *
 * Wat hier vastligt is het rekenwerk waar niemand een fout in ziet tot de
 * ranglijst niet meer klopt: wat een sessie waard is wanneer het levensteken
 * wegblijft, wat een pauze kost, en welke dag een sessie toebehoort. De
 * databankkant (groepen aanmaken, erin en eruit) hangt aan Prisma en wordt hier
 * niet nagebouwd; enkel het normaliseren van een code staat erbij, want dat is de
 * plek waar iemand anders' groep binnen handbereik ligt.
 */

vi.mock("@vtk/db", () => ({ prisma: {} }));

import {
  STUDY_MAX_SECONDS,
  isLive,
  netSeconds,
  streakFrom,
  totalsPerDay,
  weekStart,
  type StudySessionRow,
} from "@/lib/app-api/study";
import { normaliseCode } from "@/lib/app-api/studyGroups";

const NOW = new Date("2026-08-25T12:00:00.000Z");

function session(overrides: Partial<StudySessionRow> = {}): StudySessionRow {
  return {
    id: "s1",
    userId: "u1",
    subject: null,
    subjectHidden: false,
    startedAt: new Date("2026-08-25T10:00:00.000Z"),
    endedAt: null,
    pausedAt: null,
    pausedSeconds: 0,
    lastSeenAt: NOW,
    seconds: null,
    ...overrides,
  };
}

describe("een lopende sessie", () => {
  it("telt tot nu zolang de app zich meldt", () => {
    expect(netSeconds(session(), NOW)).toBe(2 * 60 * 60);
    expect(isLive(session(), NOW)).toBe(true);
  });

  it("telt tot het laatste levensteken wanneer de app zweeg", () => {
    // De telefoon viel om 11:00 stil; om 12:00 kijken we opnieuw. Dat mag één uur
    // opleveren en niet twee, anders levert een lege batterij een nachtshift op.
    const dead = session({ lastSeenAt: new Date("2026-08-25T11:00:00.000Z") });
    expect(isLive(dead, NOW)).toBe(false);
    expect(netSeconds(dead, NOW)).toBe(60 * 60);
  });

  it("trekt een pauze af, maar pas na de marge van een minuut", () => {
    const short = session({ pausedAt: new Date("2026-08-25T11:59:30.000Z") });
    expect(netSeconds(short, NOW)).toBe(2 * 60 * 60);

    const long = session({ pausedAt: new Date("2026-08-25T11:30:00.000Z") });
    // Dertig minuten weg, waarvan de eerste minuut niet telt.
    expect(netSeconds(long, NOW)).toBe(2 * 60 * 60 - (30 * 60 - 60));
  });

  it("kapt af op de maximumduur", () => {
    const marathon = session({ startedAt: new Date("2026-08-24T20:00:00.000Z") });
    expect(netSeconds(marathon, NOW)).toBe(STUDY_MAX_SECONDS);
  });

  it("gebruikt het vastgelegde getal zodra de sessie afgesloten is", () => {
    const done = session({ endedAt: new Date("2026-08-25T11:00:00.000Z"), seconds: 1234 });
    expect(netSeconds(done, NOW)).toBe(1234);
    expect(isLive(done, NOW)).toBe(false);
  });
});

describe("dagen en weken", () => {
  it("rekent een sessie toe aan de dag waarop ze begon", () => {
    // Half twaalf 's avonds Brusselse tijd, doorgaand tot na middernacht. Dat is
    // één avond en geen twee halve dagen, anders breekt een reeks die niemand brak.
    const late = session({
      startedAt: new Date("2026-08-24T21:30:00.000Z"),
      endedAt: new Date("2026-08-25T00:30:00.000Z"),
      seconds: 3 * 60 * 60,
    });
    const totals = totalsPerDay([late], NOW);
    expect(totals.get("2026-08-24")).toBe(3 * 60 * 60);
    expect(totals.has("2026-08-25")).toBe(false);
  });

  it("laat de week op maandag beginnen", () => {
    // 25 augustus 2026 is een dinsdag; de week begint dan op maandag de 24e om
    // middernacht Brusselse tijd, en dat is 22:00 UTC op de 23e (zomeruur).
    expect(weekStart(NOW).toISOString()).toBe("2026-08-23T22:00:00.000Z");
  });

  it("laat een zondag bij de week ervoor horen", () => {
    const sunday = new Date("2026-08-30T12:00:00.000Z");
    expect(weekStart(sunday).toISOString()).toBe("2026-08-23T22:00:00.000Z");
  });
});

describe("de reeks", () => {
  const goal = 4 * 60 * 60;

  it("telt de dagen op rij waarop het doel gehaald werd", () => {
    const totals = new Map([
      ["2026-08-25", goal],
      ["2026-08-24", goal + 100],
      ["2026-08-23", goal],
      ["2026-08-22", goal - 1],
    ]);
    expect(streakFrom(totals, goal, NOW)).toBe(3);
  });

  it("breekt niet omdat vandaag nog maar net begonnen is", () => {
    // Om negen uur 's ochtends heb je je dag nog niet gehaald. De reeks van
    // gisteren hoort dan gewoon te blijven staan; anders springt ze elke ochtend
    // op nul en 's avonds terug op tien.
    const totals = new Map([
      ["2026-08-25", 10 * 60],
      ["2026-08-24", goal],
      ["2026-08-23", goal],
    ]);
    expect(streakFrom(totals, goal, NOW)).toBe(2);
  });

  it("is nul wanneer gisteren ook al niet gehaald werd", () => {
    expect(streakFrom(new Map([["2026-08-20", goal]]), goal, NOW)).toBe(0);
  });
});

describe("een groepscode", () => {
  it("haalt opmaak weg en maakt er hoofdletters van", () => {
    expect(normaliseCode(" ab3-k7m ")).toBe("AB3K7M");
    expect(normaliseCode("ab3k7m")).toBe("AB3K7M");
  });

  it("gokt niet welk teken je bedoelde", () => {
    // O en 0 zitten allebei niet in het alfabet. Er wordt dus niets vervangen: zo'n
    // code hoort "niet gevonden" te geven en je niet stilletjes ergens binnen te
    // laten waar je niet hoort.
    expect(normaliseCode("O0I1AB")).toBe("O0I1AB");
  });

  it("houdt het op zes tekens", () => {
    expect(normaliseCode("ABCDEFGHIJ")).toBe("ABCDEF");
  });
});
