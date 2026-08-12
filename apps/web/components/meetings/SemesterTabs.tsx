import Link from "next/link";
import type { Semester } from "@/lib/meetings";

/** Semester 1 of 2 van het lopende werkingsjaar; de kalender hangt eraan vast. */
export function SemesterTabs({
  nl,
  base,
  semester,
}: {
  nl: boolean;
  base: string;
  semester: Semester;
}) {
  return (
    <nav className="flex flex-wrap gap-2" aria-label={nl ? "Semester" : "Semester"}>
      {([1, 2] as const).map((value) => (
        <Link
          key={value}
          href={`${base}?semester=${value}`}
          aria-current={value === semester ? "page" : undefined}
          className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
            value === semester
              ? "border-vtk-ink bg-vtk-ink text-white"
              : "border-vtk-blue/15 text-vtk-ink hover:bg-vtk-blue-soft/60"
          }`}
        >
          {nl ? `Semester ${value}` : `Semester ${value}`}
        </Link>
      ))}
    </nav>
  );
}
