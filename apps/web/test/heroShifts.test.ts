import { describe, expect, it } from "vitest";
import {
  HERO_SHIFT_MAX_ROWS,
  heroShiftFreeSpots,
  heroShiftRowCount,
  heroTitleCharsPerLine,
  heroTitleLines,
  isHeroShiftUrgent,
  pickHeroShifts,
  type HeroShiftInput,
} from "@/lib/frontpage/heroShifts";
import { parseSlogan, type SloganSize } from "@/lib/slogans";

/** Een slogan zoals de hero ze krijgt: de zin, al in regels en segmenten. */
function slogan(text: string) {
  return { lines: parseSlogan(text) };
}

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
  describe("heroTitleCharsPerLine", () => {
    it("zet meer tekens op een regel naarmate de trap kleiner is", () => {
      const sizes: SloganSize[] = ["l", "m", "s"];
      const [large, medium, small] = sizes.map(heroTitleCharsPerLine);
      expect(large).toBeLessThan(medium!);
      expect(medium!).toBeLessThan(small!);
    });

    it("komt uit op wat de hero werkelijk toont", () => {
      // Gemeten op vtk.be: "De thuis voor ingenieurs in Leuven." breekt op de
      // kleine trap in twee regels van 13 en 21 tekens.
      expect(heroTitleCharsPerLine("s")).toBeGreaterThanOrEqual(21);
      expect(heroTitleCharsPerLine("s")).toBeLessThan(25);
    });
  });

  describe("heroTitleLines", () => {
    it("telt de regels waarin een zin vanzelf afbreekt", () => {
      expect(heroTitleLines([slogan("De thuis voor *ingenieurs* in Leuven.")], "s")).toBe(2);
    });

    it("telt een harde regelafbreking mee, ook bij korte regels", () => {
      expect(heroTitleLines([slogan("Kort.\nKort.\nKort.")], "s")).toBe(3);
    });

    it("neemt de hoogste slogan en niet de eerste", () => {
      const items = [
        slogan("Kort."),
        slogan("Een merkelijk langere slogan die over meerdere regels loopt."),
      ];
      expect(heroTitleLines(items, "s")).toBeGreaterThan(1);
      // De stapel achter de h1 is zo hoog als de hoogste; de volgorde doet er
      // dus niet toe.
      expect(heroTitleLines([...items].reverse(), "s")).toBe(heroTitleLines(items, "s"));
    });

    it("negeert de sterretjes van een accent", () => {
      expect(heroTitleLines([slogan("*Kort.*")], "s")).toBe(
        heroTitleLines([slogan("Kort.")], "s"),
      );
    });
  });

  describe("heroShiftRowCount", () => {
    it("toont er drie onder de titel die er vandaag staat", () => {
      // Twee regels op de kleine trap: de hoogte waarmee de hero nu leeft.
      expect(heroShiftRowCount([slogan("De thuis voor *ingenieurs* in Leuven.")], "s")).toBe(
        HERO_SHIFT_MAX_ROWS,
      );
    });

    it("laat een rij vallen zodra de titel groeit", () => {
      const short = heroShiftRowCount([slogan("Kort en krachtig.")], "s");
      const tall = heroShiftRowCount([slogan("Kort en krachtig.")], "l");
      expect(tall).toBeLessThan(short);
    });

    it("laat er nog een vallen bij elke regel erbij", () => {
      const one = heroShiftRowCount([slogan("Kort.")], "l");
      const two = heroShiftRowCount([slogan("Kort.\nKort.")], "l");
      const three = heroShiftRowCount([slogan("Kort.\nKort.\nKort.")], "l");
      expect(one).toBeGreaterThanOrEqual(two);
      expect(two).toBeGreaterThan(three);
    });

    it("valt terug op geen enkel blok wanneer de titel de kolom vult", () => {
      expect(heroShiftRowCount([slogan("Kort.\nKort.\nKort.\nKort.")], "l")).toBe(0);
    });

    it("toont er nooit meer dan het maximum, hoe kort de titel ook is", () => {
      expect(heroShiftRowCount([slogan("Hey.")], "s")).toBe(HERO_SHIFT_MAX_ROWS);
    });
  });

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
