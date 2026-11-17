import Link from "@/components/ui/Link";
import { currentWorkingYear, formatWorkingYear } from "@/lib/workingYear";

/** De werkingsjaren met bezoeken, als kleine pillen boven de werklijst. Enkel vanaf twee jaar. */
export function LesbezoekYearTabs({
  nl,
  year,
  years,
  path,
}: {
  nl: boolean;
  year: number;
  years: number[];
  path: string;
}) {
  if (years.length < 2) return null;
  return (
    <nav className="flex flex-wrap gap-2" aria-label={nl ? "Werkingsjaar" : "Working year"}>
      {years.map((value) => (
        <Link
          key={value}
          href={value === currentWorkingYear() ? path : `${path}?jaar=${value}`}
          aria-current={value === year ? "page" : undefined}
          className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
            value === year
              ? "border-vtk-ink bg-vtk-blue-soft text-vtk-ink"
              : "border-vtk-blue/15 text-[#5c667f] hover:bg-vtk-blue-soft/60"
          }`}
        >
          {formatWorkingYear(value)}
        </Link>
      ))}
    </nav>
  );
}
