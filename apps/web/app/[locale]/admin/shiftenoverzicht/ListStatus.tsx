import type { OverviewListRow } from "@/lib/praesidiumShifts/overview";

/** Of een lijst meetelt, en zo niet, wat er nog moet gebeuren. */
export function ListStatus({ list, nl }: { list: OverviewListRow; nl: boolean }) {
  if (list.status === "DRAFT") {
    return (
      <span className="rounded-full bg-[var(--low-bg)] px-2 py-0.5 text-xs font-medium text-[var(--low-ink)]">
        {nl ? "Nog na te kijken" : "To review"}
      </span>
    );
  }
  if (list.unresolvedNames > 0) {
    return (
      <span className="rounded-full bg-[var(--low-bg)] px-2 py-0.5 text-xs font-medium text-[var(--low-ink)]">
        {nl
          ? `${list.unresolvedNames} ${list.unresolvedNames === 1 ? "naam" : "namen"} open`
          : `${list.unresolvedNames} ${list.unresolvedNames === 1 ? "name" : "names"} open`}
      </span>
    );
  }
  return <span className="text-xs text-vtk-muted">{nl ? "Bevestigd" : "Confirmed"}</span>;
}
