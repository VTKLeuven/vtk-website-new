import { describe, expect, it, vi } from "vitest";

vi.mock("@vtk/db", () => ({ prisma: {} }));

import { STUDY_MAX_SUBJECTS, cleanSubjects } from "@/lib/app-api/study";

describe("cleanSubjects", () => {
  it("kort in, laat lege weg en houdt de volgorde", () => {
    expect(cleanSubjects(["  Analyse  ", "", "Mechanica   II"])).toEqual(["Analyse", "Mechanica II"]);
  });

  it("houdt één van twee vakken die enkel in hoofdletters verschillen", () => {
    expect(cleanSubjects(["Analyse", "analyse", "ANALYSE"])).toEqual(["Analyse"]);
  });

  it("kapt af op het maximum en op zestig tekens", () => {
    const many = Array.from({ length: 30 }, (_, i) => `Vak ${i}`);
    expect(cleanSubjects(many)).toHaveLength(STUDY_MAX_SUBJECTS);
    expect(cleanSubjects(["x".repeat(80)])[0]).toHaveLength(60);
  });
});
