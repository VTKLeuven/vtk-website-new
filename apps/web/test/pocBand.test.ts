import { describe, expect, it } from "vitest";
import {
  defaultPocBandSetting,
  pocBandDaysLeft,
  pocBandIsOpen,
  pocBandStepState,
  pocBandStepWhen,
  pocPageNotice,
  readPocBandSetting,
  type PocBandStep,
} from "@/lib/home/pocBand";

describe("pocBand", () => {
  describe("readPocBandSetting", () => {
    it("geeft standaardwaarden terug bij null of ongeldige input", () => {
      const def = defaultPocBandSetting();
      expect(readPocBandSetting(null)).toEqual(def);
      expect(readPocBandSetting("invalid")).toEqual(def);
      expect(readPocBandSetting([])).toEqual(def);
    });

    it("leest geldige instellingen en normaliseert stappen", () => {
      const input = {
        mode: "elections",
        headingNl: "Aangepaste kop",
        headingEn: "Custom heading",
        deadline: "2026-10-07T21:59:00.000Z",
        steps: [
          {
            titleNl: "Stap 1",
            titleEn: "Step 1",
            bodyNl: "Uitleg",
            bodyEn: "Explanation",
            from: "2026-10-01",
            to: "2026-10-07",
          },
          {
            titleNl: "",
            titleEn: "",
            bodyNl: "Leeg",
          },
        ],
      };

      const result = readPocBandSetting(input);
      expect(result.mode).toBe("elections");
      expect(result.headingNl).toBe("Aangepaste kop");
      expect(result.headingEn).toBe("Custom heading");
      expect(result.deadline).toBe("2026-10-07T21:59:00.000Z");
      expect(result.steps).toHaveLength(1);
      expect(result.steps[0].titleNl).toBe("Stap 1");
      expect(result.steps[0].from).toBe("2026-10-01");
      expect(result.steps[0].to).toBe("2026-10-07");
    });

    it("houdt enkel een fotokey van de upload-route over", () => {
      expect(readPocBandSetting({ imageKey: "images/abc.jpg" }).imageKey).toBe("images/abc.jpg");
      // Alles van buiten `images/` is geknoei met de instelling en valt weg;
      // de band toont dan de meegeleverde standaardfoto.
      expect(readPocBandSetting({ imageKey: "vault/config.json" }).imageKey).toBeNull();
      expect(readPocBandSetting({ imageKey: 42 }).imageKey).toBeNull();
      expect(readPocBandSetting({}).imageKey).toBeNull();
    });
  });

  describe("pocBandStepState", () => {
    const step: PocBandStep = {
      titleNl: "Kandidaatstelling",
      titleEn: "Candidacy",
      bodyNl: "",
      bodyEn: "",
      from: "2026-10-01",
      to: "2026-10-07",
    };

    it("geeft 'upcoming' vóór de startdatum", () => {
      const now = new Date("2026-09-25T12:00:00Z");
      expect(pocBandStepState(step, now)).toBe("upcoming");
    });

    it("geeft 'now' tijdens de periode", () => {
      const now = new Date("2026-10-03T12:00:00Z");
      expect(pocBandStepState(step, now)).toBe("now");
    });

    it("geeft 'done' na de einddatum", () => {
      const now = new Date("2026-10-08T12:00:00Z");
      expect(pocBandStepState(step, now)).toBe("done");
    });
  });

  describe("pocBandDaysLeft", () => {
    const now = new Date("2026-09-18T12:00:00Z");

    it("geeft aantal dagen tot deadline", () => {
      const deadline = "2026-10-07T21:59:00.000Z";
      expect(pocBandDaysLeft(deadline, now)).toBe(19);
    });

    it("geeft 0 op de dag van de deadline", () => {
      const deadline = "2026-09-18T21:59:00.000Z";
      expect(pocBandDaysLeft(deadline, now)).toBe(0);
    });

    it("geeft null als deadline voorbij is of ongeldig", () => {
      expect(pocBandDaysLeft("2026-09-10T12:00:00Z", now)).toBeNull();
      expect(pocBandDaysLeft(null, now)).toBeNull();
    });
  });

  describe("pocBandIsOpen", () => {
    const now = new Date("2026-09-18T12:00:00Z");

    it("is open als er geen deadline is", () => {
      const setting = defaultPocBandSetting();
      expect(pocBandIsOpen(setting, now)).toBe(true);
    });

    it("is open als deadline in de toekomst ligt", () => {
      const setting = { ...defaultPocBandSetting(), deadline: "2026-10-07T21:59:00.000Z" };
      expect(pocBandIsOpen(setting, now)).toBe(true);
    });

    it("is gesloten als deadline voorbij is", () => {
      const setting = { ...defaultPocBandSetting(), deadline: "2026-09-10T12:00:00Z" };
      expect(pocBandIsOpen(setting, now)).toBe(false);
    });
  });

  describe("pocBandStepWhen", () => {
    it("formatteert datumbereik in het Nederlands", () => {
      const step: PocBandStep = {
        titleNl: "Stap",
        titleEn: "Step",
        bodyNl: "",
        bodyEn: "",
        from: "2026-10-08",
        to: "2026-10-12",
      };
      const when = pocBandStepWhen(step, "nl");
      expect(when).toContain("8 okt");
      expect(when).toContain("12 okt");
    });

    it("formatteert 'tot' datum", () => {
      const step: PocBandStep = {
        titleNl: "Stap",
        titleEn: "Step",
        bodyNl: "",
        bodyEn: "",
        from: null,
        to: "2026-10-07",
      };
      expect(pocBandStepWhen(step, "nl")).toMatch(/^tot\s+7\s+okt/);
      expect(pocBandStepWhen(step, "en")).toMatch(/^until\s+7\s+Oct/);
    });
  });

  describe("pocPageNotice", () => {
    const setting = { ...defaultPocBandSetting(), mode: "elections" as const };

    it("toont de disclaimer in verkiezingsmodus bij het huidige werkingsjaar", () => {
      expect(pocPageNotice(setting, "nl", 2026, 2026)).toContain("nog niet verkozen");
      expect(pocPageNotice(setting, "en", 2026, 2026)).toContain("not been elected");
    });

    it("zwijgt bij een ouder werkingsjaar", () => {
      expect(pocPageNotice(setting, "nl", 2024, 2026)).toBeNull();
    });

    it("zwijgt buiten verkiezingsmodus", () => {
      expect(pocPageNotice(defaultPocBandSetting(), "nl", 2026, 2026)).toBeNull();
      expect(pocPageNotice({ ...setting, mode: "hidden" }, "nl", 2026, 2026)).toBeNull();
    });

    it("zwijgt wanneer de redactie beide velden leegmaakt", () => {
      const empty = { ...setting, noticeNl: "", noticeEn: "   " };
      expect(pocPageNotice(empty, "nl", 2026, 2026)).toBeNull();
      expect(pocPageNotice(empty, "en", 2026, 2026)).toBeNull();
    });

    it("valt voor Engels terug op de Nederlandse tekst", () => {
      const half = { ...setting, noticeNl: "Nog kandidaat.", noticeEn: "" };
      expect(pocPageNotice(half, "en", 2026, 2026)).toBe("Nog kandidaat.");
    });
  });
});
