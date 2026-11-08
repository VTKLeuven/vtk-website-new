import type { PollStatus } from "@/lib/pocPolls/core";

const STYLES: Record<PollStatus, string> = {
  DRAFT: "bg-vtk-blue-soft text-vtk-muted",
  OPEN: "bg-vtk-yellow text-vtk-ink",
  CLOSED: "bg-vtk-blue-soft text-vtk-ink",
};

export function PollStatusPill({ status, nl }: { status: PollStatus; nl: boolean }) {
  const label =
    status === "DRAFT" ? (nl ? "Concept" : "Draft") : status === "OPEN" ? "Open" : nl ? "Afgesloten" : "Closed";
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STYLES[status]}`}>{label}</span>;
}

export function pollDateLabel(date: Date, nl: boolean): string {
  return date.toLocaleString(nl ? "nl-BE" : "en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Brussels",
  });
}
