import { describe, expect, it } from "vitest";
import { splitYearBar } from "@/lib/workingYear";

describe("splitYearBar", () => {
  const years = [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019];

  it("zet de nieuwste jaren in de balk en de rest in het archief", () => {
    const { bar, archive } = splitYearBar(years, 2026, 5);
    expect(bar).toEqual([2026, 2025, 2024, 2023, 2022]);
    expect(archive).toEqual([2021, 2020, 2019]);
  });

  it("laat het archief leeg wanneer alle jaren in de balk passen", () => {
    const { bar, archive } = splitYearBar([2026, 2025], 2026, 5);
    expect(bar).toEqual([2026, 2025]);
    expect(archive).toEqual([]);
  });

  it("haalt een gekozen archiefjaar naar de balk", () => {
    const { bar, archive } = splitYearBar(years, 2019, 5);
    expect(bar).toEqual([2026, 2025, 2024, 2023, 2022, 2019]);
    expect(archive).toEqual([2021, 2020]);
    expect(archive).not.toContain(2019);
  });

  it("sorteert aflopend, ongeacht de volgorde van de invoer", () => {
    const { bar } = splitYearBar([2022, 2026, 2024], 2026, 5);
    expect(bar).toEqual([2026, 2024, 2022]);
  });

  it("verzint geen jaar dat niet in de data zit", () => {
    const { bar } = splitYearBar([2026, 2025], 1999, 5);
    expect(bar).toEqual([2026, 2025]);
  });

  it("wijzigt de meegegeven lijst niet", () => {
    const input = [2024, 2026, 2025];
    splitYearBar(input, 2026, 2);
    expect(input).toEqual([2024, 2026, 2025]);
  });
});
