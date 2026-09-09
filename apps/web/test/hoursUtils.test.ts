import { describe, expect, it } from "vitest";
import { shortDayLabel, shortWeekday } from "@/components/editorial/hoursUtils";

describe("hoursUtils short day labels", () => {
  it("formats 2-letter uppercase day names for Dutch locale", () => {
    expect(shortDayLabel({ dayNl: "Maandag", dayEn: "Monday" }, "nl")).toBe("MA");
    expect(shortDayLabel({ dayNl: "Dinsdag", dayEn: "Tuesday" }, "nl")).toBe("DI");
    expect(shortDayLabel({ dayNl: "Woensdag", dayEn: "Wednesday" }, "nl")).toBe("WO");
    expect(shortDayLabel({ dayNl: "Donderdag", dayEn: "Thursday" }, "nl")).toBe("DO");
    expect(shortDayLabel({ dayNl: "Vrijdag", dayEn: "Friday" }, "nl")).toBe("VR");
    expect(shortDayLabel({ dayNl: "Zaterdag", dayEn: "Saturday" }, "nl")).toBe("ZA");
    expect(shortDayLabel({ dayNl: "Zondag", dayEn: "Sunday" }, "nl")).toBe("ZO");
  });

  it("formats 3-letter uppercase day names for English locale", () => {
    expect(shortDayLabel({ dayNl: "Maandag", dayEn: "Monday" }, "en")).toBe("MON");
    expect(shortDayLabel({ dayNl: "Dinsdag", dayEn: "Tuesday" }, "en")).toBe("TUE");
    expect(shortDayLabel({ dayNl: "Woensdag", dayEn: "Wednesday" }, "en")).toBe("WED");
    expect(shortDayLabel({ dayNl: "Donderdag", dayEn: "Thursday" }, "en")).toBe("THU");
    expect(shortDayLabel({ dayNl: "Vrijdag", dayEn: "Friday" }, "en")).toBe("FRI");
    expect(shortDayLabel({ dayNl: "Zaterdag", dayEn: "Saturday" }, "en")).toBe("SAT");
    expect(shortDayLabel({ dayNl: "Zondag", dayEn: "Sunday" }, "en")).toBe("SUN");
  });

  it("formats shortWeekday according to locale", () => {
    // 2026-09-09 is a Wednesday (index 2)
    const wednesday = new Date("2026-09-09T10:00:00Z");
    expect(shortWeekday(wednesday, "nl")).toBe("WO");
    expect(shortWeekday(wednesday, "en")).toBe("WED");

    // 2026-09-13 is a Sunday (index 6)
    const sunday = new Date("2026-09-13T10:00:00Z");
    expect(shortWeekday(sunday, "nl")).toBe("ZO");
    expect(shortWeekday(sunday, "en")).toBe("SUN");
  });
});
