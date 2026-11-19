import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { momentToDraft, type MomentValue } from "@/lib/calendar/momentDraft";
import { parseMomentsField } from "@/lib/calendar/momentForm";

/**
 * De save-action gooit de momenten van een evenement weg en maakt ze opnieuw aan
 * uit wat het formulier meestuurt. Een veld dat die heen-en-terugweg niet aflegt,
 * is dus na de eerstvolgende bewaring stil weg, ook wanneer niemand eraan raakte.
 */

const FULL: MomentValue = {
  start: new Date("2026-11-16T19:30:00.000Z"),
  end: new Date("2026-11-16T20:30:00.000Z"),
  label: "Pinguino Run",
  location: "Sportkot",
  descriptionNl: "We lopen in **pinguinpak**.",
  descriptionEn: "We run in **penguin suits**.",
  imageKey: "images/0123456789abcdef01234567.jpg",
  imageFocusX: 0.25,
  imageFocusY: 0.75,
};

function roundTrip(moment: MomentValue) {
  return parseMomentsField(JSON.stringify([momentToDraft(moment)]));
}

describe("the moments field of the event form", () => {
  it("carries every field of a moment through the form unchanged", () => {
    expect(roundTrip(FULL)).toEqual([FULL]);
  });

  it("handles every column of CalendarEventMoment", () => {
    // Faalt zodra er een kolom bijkomt die niet door het formulier gaat. Voeg ze
    // dan toe aan `MomentValue`, `momentToDraft` en `parseMomentsField`, want de
    // save-action zou ze anders bij elke bewaring wissen.
    const model = Prisma.dmmf.datamodel.models.find((m) => m.name === "CalendarEventMoment");
    const columns = model!.fields
      .filter((field) => field.kind !== "object" && field.name !== "id" && field.name !== "eventId")
      .map((field) => field.name)
      .sort();
    expect(Object.keys(FULL).sort()).toEqual(columns);
  });

  it("stores what was left empty as empty, so the moment follows the event", () => {
    const parsed = roundTrip({
      ...FULL,
      label: null,
      location: null,
      descriptionNl: null,
      descriptionEn: null,
      imageKey: null,
    });
    expect(parsed).toEqual([
      expect.objectContaining({
        label: null,
        location: null,
        descriptionNl: null,
        descriptionEn: null,
        imageKey: null,
      }),
    ]);
  });

  it("accepts a row from before these fields existed", () => {
    expect(
      parseMomentsField(JSON.stringify([{ date: "2026-11-16", start: "20:30", end: "21:30", label: "" }])),
    ).toEqual([
      expect.objectContaining({ location: null, imageKey: null, imageFocusX: 0.5, imageFocusY: 0.5 }),
    ]);
  });

  it("reads an end before the start as the night after", () => {
    const [night] = parseMomentsField(
      JSON.stringify([{ date: "2026-11-16", start: "22:00", end: "02:00" }]),
    ) as MomentValue[];
    expect(night!.end).toEqual(new Date("2026-11-17T01:00:00.000Z"));
  });

  it("refuses an image key from outside the image folders", () => {
    const row = { date: "2026-11-16", start: "20:30", end: "21:30", imageKey: "bonnetjes/geheim.jpg" };
    expect(parseMomentsField(JSON.stringify([row]))).toBe("invalid");
  });

  it("means a continuous period when the field is absent", () => {
    expect(parseMomentsField(null)).toBeNull();
  });
});
