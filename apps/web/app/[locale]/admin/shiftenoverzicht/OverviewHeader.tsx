import Link from "@/components/ui/Link";
import { formatWorkingYear } from "@/lib/workingYear";

export type OverviewTab = "lijsten" | "praesidiumshiften";

const TABS: { key: OverviewTab; href: string; nl: string; en: string }[] = [
  { key: "lijsten", href: "", nl: "Shiftenlijsten", en: "Shift lists" },
  { key: "praesidiumshiften", href: "/praesidiumshiften", nl: "Praesidiumshiften", en: "Praesidium shifts" },
];

/**
 * Kop van het shiftenoverzicht: titel, de twee tabbladen en het werkingsjaar.
 * Het jaar reist mee met elk tabblad, zodat je niet terug op 26-27 belandt
 * wanneer je in 25-26 van tabblad wisselt.
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
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">{nl ? "Shiftenoverzicht praesidium" : "Praesidium shift overview"}</h1>
        <p className="mt-1 max-w-3xl text-sm text-vtk-muted">{subtitle}</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-2" aria-label={nl ? "Onderdelen" : "Sections"}>
          {TABS.map((tab) => {
            const isActive = tab.key === active;
            return (
              <Link
                key={tab.key}
                href={`${base}/admin/shiftenoverzicht${tab.href}?jaar=${year}`}
                aria-current={isActive ? "page" : undefined}
                className={`rounded-full border px-3 py-1.5 text-sm ${
                  isActive
                    ? "border-vtk-ink bg-vtk-ink text-vtk-surface"
                    : "border-vtk-blue/15 text-vtk-ink hover:bg-vtk-blue-soft/60"
                }`}
              >
                {nl ? tab.nl : tab.en}
              </Link>
            );
          })}
        </nav>
        {years.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5" aria-label={nl ? "Werkingsjaar" : "Working year"}>
            {years.map((y) => {
              const isActive = y === year;
              const tab = TABS.find((t) => t.key === active)!;
              return (
                <Link
                  key={y}
                  href={`${base}/admin/shiftenoverzicht${tab.href}?jaar=${y}`}
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
    </div>
  );
}
