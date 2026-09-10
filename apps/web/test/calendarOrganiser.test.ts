import { describe, expect, it } from "vitest";
import { organiserName } from "@/lib/calendar/organiser";

/**
 * Wie er als organisator van een evenement getoond wordt. De beherende groep is
 * de standaard; `CalendarEvent.organiserName` neemt het over bij een crossover
 * of bij een evenement dat een partner in onze kalender koopt.
 */
const group = { nameNl: "Fakbar", nameEn: "Fakbar Bar Team" };

describe("organiserName", () => {
  it("valt terug op de groep wanneer er geen organisator is ingevuld", () => {
    expect(organiserName(null, group, "nl")).toBe("Fakbar");
    expect(organiserName(undefined, group, "en")).toBe("Fakbar Bar Team");
  });

  it("toont de ingevulde organisator in plaats van de groep", () => {
    expect(organiserName("Industria", group, "nl")).toBe("Industria");
    expect(organiserName("Industria", group, "en")).toBe("Industria");
  });

  it("behandelt een naam van enkel spaties als niet ingevuld", () => {
    expect(organiserName("   ", group, "nl")).toBe("Fakbar");
  });

  it("laat spaties rond een echte naam weg", () => {
    expect(organiserName("  Bosch  ", group, "nl")).toBe("Bosch");
  });
});
