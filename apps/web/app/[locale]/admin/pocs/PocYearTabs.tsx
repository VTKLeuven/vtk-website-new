import Link from "@/components/ui/Link";
import { prisma } from "@vtk/db";
import { formatWorkingYear, workingYearTabs } from "@/lib/workingYear";

/**
 * De werkingsjaren van de vertegenwoordigers, als pillen. Op het tabblad POC's
 * en op Groepsadressen: allebei tonen ze de vertegenwoordigers van één jaar.
 */
export async function PocYearTabs({ year, href }: { year: number; href: (year: number) => string }) {
  const distinctYears = await prisma.pocRepresentative.findMany({ distinct: ["year"], select: { year: true } });
  const tabs = workingYearTabs(distinctYears.map((row) => row.year));
  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((y) => {
        const active = y === year;
        return (
          <Link
            key={y}
            href={href(y)}
            aria-current={active ? "page" : undefined}
            className={
              "rounded-full border px-4 py-1.5 text-sm font-medium transition " +
              (active
                ? "border-vtk-ink bg-vtk-ink text-white"
                : "border-vtk-blue/20 bg-white text-vtk-ink hover:bg-vtk-blue-soft/50")
            }
          >
            {formatWorkingYear(y)}
          </Link>
        );
      })}
    </div>
  );
}
