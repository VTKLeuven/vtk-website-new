"use client";

import { useSearchParams } from "next/navigation";
import Link from "@/components/ui/Link";

export type OverviewChip = {
  /** De parameter in de URL: `soort` of `opruimen`. */
  param: string;
  value: string;
  label: string;
  count: number;
  active: boolean;
};

/**
 * De filters boven het overzicht (soort, leeg, te verwijderen, archief).
 *
 * In de browser opgebouwd, omdat de zoekterm (`?q=`) daar leeft: een link die
 * de server maakte, kende de zoekterm van het laden en niet wat je sindsdien
 * typte, en wiste ze dus bij elke klik. De open categorieën (`?open=`) gaan
 * wel weg: een andere filter is een andere lijst.
 */
export function OverviewFilters({
  nl,
  chips,
  archivedCount,
  showArchive,
  note,
}: {
  nl: boolean;
  chips: OverviewChip[];
  archivedCount: number;
  showArchive: boolean;
  note: string | null;
}) {
  const params = useSearchParams();
  const href = (param: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    next.delete("open");
    if (value) next.set(param, value);
    else next.delete(param);
    const qs = next.toString();
    return qs ? `?${qs}` : "?";
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {chips.map((chip) => (
          <Link
            key={`${chip.param}:${chip.value}`}
            href={href(chip.param, chip.active ? null : chip.value)}
            aria-current={chip.active ? "page" : undefined}
            className={[
              "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[13px] no-underline",
              chip.active
                ? "border-vtk-ink bg-vtk-ink text-vtk-surface"
                : "border-vtk-blue/15 bg-white text-vtk-ink hover:border-vtk-blue/30",
            ].join(" ")}
          >
            {chip.label} <span className="tabular-nums">{chip.count}</span>
          </Link>
        ))}
        {archivedCount > 0 && (
          <Link href={href("archief", showArchive ? null : "1")} className="vtk-link ml-1 text-sm">
            {showArchive
              ? nl
                ? "Archief verbergen"
                : "Hide archive"
              : nl
                ? `Archief tonen (${archivedCount})`
                : `Show archive (${archivedCount})`}
          </Link>
        )}
      </div>
      {note && <p className="max-w-3xl text-sm text-zinc-500">{note}</p>}
    </div>
  );
}
