import Link from "@/components/ui/Link";
import { formatWorkingYear } from "@/lib/workingYear";

export type OverviewTab = "lijsten" | "praesidiumshiften";

/**
 * De uitleg van een tabblad van het shiftenoverzicht, met de werkingsjaren
 * ernaast. De titel en de tabbladen staan in de layout (`ModuleAdminShell`);
 * die neemt het jaar mee naar elk tabblad, zodat je niet terug op het lopende
 * jaar belandt wanneer je in een ouder jaar van tabblad wisselt.
 */
export function OverviewHeader({
  nl,
  active,
  year,
  years,
  subtitle,
}: {
  nl: boolean;
  active: OverviewTab;
  year: number;
  years: number[];
  subtitle: string;
}) {
  const base = nl ? "" : "/en";
  const path = `${base}/admin/shiftenoverzicht${active === "praesidiumshiften" ? "/praesidiumshiften" : ""}`;
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <p className="max-w-3xl text-sm text-vtk-muted">{subtitle}</p>
      {years.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label={nl ? "Werkingsjaar" : "Working year"}>
          {years.map((y) => {
            const isActive = y === year;
            return (
              <Link
                key={y}
                href={`${path}?jaar=${y}`}
                aria-current={isActive ? "page" : undefined}
                className={`rounded-full px-2.5 py-1 text-xs font-medium tabular-nums ${
                  isActive ? "bg-vtk-blue-soft text-vtk-ink" : "text-vtk-muted hover:text-vtk-ink"
                }`}
              >
                {formatWorkingYear(y)}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
