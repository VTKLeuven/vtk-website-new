import { describe, expect, it } from "vitest";
import { optionAnswerCounts } from "@/lib/forms/optionAnswerCounts";

describe("antwoordaantallen per formulieroptie", () => {
  it("houdt dezelfde optiecode van twee vragen apart", () => {
    const counts = optionAnswerCounts([
      { fieldId: "aanwezig", valueOptions: ["ja"] },
      { fieldId: "vegetarisch", valueOptions: ["ja"] },
      { fieldId: "aanwezig", valueOptions: ["ja"] },
    ]);

    expect(counts.get("aanwezig")?.get("ja")).toBe(2);
    expect(counts.get("vegetarisch")?.get("ja")).toBe(1);
  });

  it("telt een dubbele code in één antwoord maar één keer", () => {
    // Nieuwe inzendingen worden al gevalideerd, maar oudere of geïmporteerde
    // data mag de waarschuwing niet groter maken dan het aantal inzendingen.
    const counts = optionAnswerCounts([
      { fieldId: "shift", valueOptions: ["vroeg", "vroeg"] },
    ]);

    expect(counts.get("shift")?.get("vroeg")).toBe(1);
  });
});
