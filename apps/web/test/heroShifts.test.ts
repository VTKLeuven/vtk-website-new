import { describe, expect, it } from "vitest";
import {
  heroShiftFreeSpots,
  isHeroShiftUrgent,
  pickHeroShifts,
  type HeroShiftInput,
} from "@/lib/frontpage/heroShifts";

const now = new Date("2026-09-12T10:00:00Z");

function shift(overrides: Partial<HeroShiftInput> = {}): HeroShiftInput & { id: string } {
  return {
    id: Math.random().toString(36).slice(2),
    startTime: new Date("2026-09-15T18:00:00Z"),
    endTime: new Date("2026-09-15T22:00:00Z"),
    maxParticipants: 4,
    takenSpots: 1,
    viewerRegistered: false,
    ...overrides,
  };
}

describe("heroShifts", () => {
  describe("pickHeroShifts", () => {
    it("neemt de eerstvolgende, ook als een latere meer plaats heeft", () => {
      const soon = shift({ startTime: new Date("2026-09-13T18:00:00Z"), maxParticipants: 2 });
      const later = shift({
        startTime: new Date("2026-09-20T18:00:00Z"),
        endTime: new Date("2026-09-20T22:00:00Z"),
        maxParticipants: 9,
      });
      expect(pickHeroShifts([later, soon], { now, limit: 1 })).toEqual([soon]);
    });

    it("laat de volle shiften weg", () => {
      const full = shift({ maxParticipants: 3, takenSpots: 3 });
      const open = shift({ takenSpots: 0 });
      expect(pickHeroShifts([full, open], { now, limit: 3 })).toEqual([open]);
    });

    it("laat weg waar je zelf al voor ingeschreven staat", () => {
      const mine = shift({ viewerRegistered: true });
      expect(pickHeroShifts([mine], { now, limit: 3 })).toEqual([]);
    });

    it("houdt een shift die bezig is en nog plaats heeft", () => {
      const running = shift({
        startTime: new Date("2026-09-12T09:00:00Z"),
        endTime: new Date("2026-09-12T14:00:00Z"),
      });
      expect(pickHeroShifts([running], { now, limit: 3 })).toEqual([running]);
    });

    it("laat weg wat al afgelopen is", () => {
      const done = shift({
        startTime: new Date("2026-09-11T09:00:00Z"),
        endTime: new Date("2026-09-11T14:00:00Z"),
      });
      expect(pickHeroShifts([done], { now, limit: 3 })).toEqual([]);
    });

    it("toont niets wanneer er geen plaats voor het blok is", () => {
      expect(pickHeroShifts([shift()], { now, limit: 0 })).toEqual([]);
    });
  });

  describe("heroShiftFreeSpots", () => {
    it("wordt nooit negatief, ook niet bij een overboekte shift", () => {
      expect(heroShiftFreeSpots({ maxParticipants: 2, takenSpots: 5 })).toBe(0);
    });
  });

  describe("isHeroShiftUrgent", () => {
    it("markeert wat binnen een dag begint", () => {
      expect(isHeroShiftUrgent({ startTime: new Date("2026-09-12T20:00:00Z") }, now)).toBe(true);
    });

    it("markeert ook wat al bezig is", () => {
      expect(isHeroShiftUrgent({ startTime: new Date("2026-09-12T08:00:00Z") }, now)).toBe(true);
    });

    it("laat wat verder weg ligt gewoon staan", () => {
      expect(isHeroShiftUrgent({ startTime: new Date("2026-09-15T18:00:00Z") }, now)).toBe(false);
    });
  });
});
