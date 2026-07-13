"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Locale } from "@vtk/i18n";
import { Label, Select } from "@vtk/ui";

/** Academiejaarkiezer die het gekozen jaar in de URL (`?year=`) bijhoudt. */
export function YearPicker({
  locale,
  year,
  years,
}: {
  locale: Locale;
  year: number;
  years: number[];
}) {
  const nl = locale === "nl";
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setYear(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("year", value);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div>
      <Label>{nl ? "Academiejaar" : "Academic year"}</Label>
      <Select value={String(year)} onChange={(e) => setYear(e.target.value)} className="w-40">
        {years.map((y) => (
          <option key={y} value={y}>
            {y}–{y + 1}
          </option>
        ))}
      </Select>
    </div>
  );
}
