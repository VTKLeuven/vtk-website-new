import { describe, expect, it } from "vitest";
import {
  cumulative,
  dayRange,
  daysBefore,
  joinHistory,
  niceTicks,
  totalBefore,
} from "@/lib/careerTimeline";
import { profileCareerOutcome, profileConfirmationVia } from "@/lib/studyConfirmation";

describe("dayRange", () => {
  it("geeft elke dag, ook over een maandgrens en de zomertijd heen", () => {
    expect(dayRange("2026-09-29", "2026-10-02")).toEqual([
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
    ]);
    // 25 oktober 2026 is de overgang naar wintertijd: geen dag dubbel of weg.
    expect(dayRange("2026-10-24", "2026-10-26")).toHaveLength(3);
  });

  it("is leeg wanneer het einde voor het begin ligt", () => {
    expect(dayRange("2026-09-22", "2026-09-21")).toEqual([]);
  });

  it("telt terug met daysBefore", () => {
    expect(daysBefore("2026-09-22", 41)).toBe("2026-08-12");
  });
});

describe("cumulative", () => {
  it("telt op vanaf wat er voor het venster al was", () => {
    const perDay = new Map([
      ["2026-09-01", 5],
      ["2026-09-20", 2],
      ["2026-09-22", 3],
    ]);
    const days = dayRange("2026-09-20", "2026-09-22");
    expect(totalBefore(perDay, "2026-09-20")).toBe(5);
    expect(cumulative(days, perDay, totalBefore(perDay, days[0]))).toEqual([7, 7, 10]);
  });
});

describe("joinHistory", () => {
  const days = dayRange("2026-09-18", "2026-09-22");

  it("reconstrueert enkel voor de eerste echte telling", () => {
    const measured = new Map([
      ["2026-09-21", 40],
      ["2026-09-22", 38],
    ]);
    const history = joinHistory(days, measured, [30, 31, 35, 39, 41]);
    // Vanaf de eerste telling geldt die, ook waar de reconstructie hoger ligt
    // (wie Career weer uitzette, ziet enkel de telling).
    expect(history.values).toEqual([30, 31, 35, 40, 38]);
    expect(history.reconstructedUntil).toBe(3);
  });

  it("laat een dag zonder telling na de start leeg in plaats van te verzinnen", () => {
    const measured = new Map([
      ["2026-09-19", 10],
      ["2026-09-21", 12],
    ]);
    expect(joinHistory(days, measured, [9, 9, 9, 9, 9]).values).toEqual([9, 10, null, 12, null]);
  });

  it("reconstrueert alles zolang er nog geen telling is", () => {
    expect(joinHistory(days, new Map(), [1, 2, 3, 4, 5])).toEqual({
      values: [1, 2, 3, 4, 5],
      reconstructedUntil: 5,
    });
  });

  it("toont zonder reconstructie enkel de telling", () => {
    const history = joinHistory(days, new Map([["2026-09-22", 7]]), null);
    expect(history).toEqual({ values: [null, null, null, null, 7], reconstructedUntil: 0 });
  });
});

describe("niceTicks", () => {
  it("rondt af op 1, 2 of 5 maal een macht van tien", () => {
    expect(niceTicks(870)).toEqual([0, 500, 1000]);
    expect(niceTicks(46)).toEqual([0, 20, 40, 60]);
  });

  it("zet nooit een streepje tussen twee hele mensen", () => {
    expect(niceTicks(2)).toEqual([0, 1, 2]);
    expect(niceTicks(0)).toEqual([0, 1]);
  });
});

describe("profileConfirmationVia", () => {
  const year = 2026;

  it("telt de onboarding van een student altijd", () => {
    expect(
      profileConfirmationVia({ wasOnboarded: false, isStudent: true, previousConfirmedYear: null, year }),
    ).toBe("ONBOARDING");
  });

  it("telt een opslag op /account enkel wanneer die een nieuw jaar bevestigt", () => {
    // Tussen 14 en 21 september: het jaar heet al 26-27 en de gate staat dicht.
    expect(
      profileConfirmationVia({ wasOnboarded: true, isStudent: true, previousConfirmedYear: 2025, year }),
    ).toBe("ACCOUNT");
    // Wie zijn gsm-nummer aanpast na de bevestiging, bevestigt niets opnieuw.
    expect(
      profileConfirmationVia({ wasOnboarded: true, isStudent: true, previousConfirmedYear: 2026, year }),
    ).toBeNull();
  });

  it("telt niets voor wie geen student is", () => {
    expect(
      profileConfirmationVia({ wasOnboarded: false, isStudent: false, previousConfirmedYear: null, year }),
    ).toBeNull();
  });
});

describe("profileCareerOutcome", () => {
  it("telt wie Career nog niet had als gevraagd", () => {
    expect(profileCareerOutcome(["FEEST"], ["FEEST", "CAREER"])).toEqual({
      careerBefore: false,
      careerAsked: true,
      careerChosen: true,
    });
    expect(profileCareerOutcome([], ["SPORT"])).toEqual({
      careerBefore: false,
      careerAsked: true,
      careerChosen: false,
    });
  });

  it("telt wie Career al had niet als nieuwe keuze", () => {
    expect(profileCareerOutcome(["CAREER"], ["CAREER"])).toEqual({
      careerBefore: true,
      careerAsked: false,
      careerChosen: false,
    });
  });
});
