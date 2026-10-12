import type { ReactNode } from "react";
import Link from "@/components/ui/Link";
import { formatCount } from "@/lib/praesidiumShifts/stats";
import type { OverviewListRow } from "@/lib/praesidiumShifts/overview";

export type TodoItem = { key: string; title: string; text: string; href: string; action: string };

/**
 * Wat er nog moet gebeuren voor de stand klopt: een opgeladen lijst die nog
 * niet bevestigd is, of namen die op een keuze wachten. Eén kaart met een regel
 * per ding; zonder iets te doen verschijnt ze niet.
 */
export function TodoCard({ items, nl }: { items: TodoItem[]; nl: boolean }) {
  if (items.length === 0) return null;
  return (
    <section
      aria-label={nl ? "Nog te doen" : "To do"}
      className="rounded-[18px] border border-vtk-blue/10 bg-vtk-surface-elevated"
    >
      <ul>
        {items.map((item, index) => (
          <li
            key={item.key}
            className={`flex flex-wrap items-center gap-3 px-4 py-2.5 ${index > 0 ? "border-t border-[var(--rule-soft)]" : ""}`}
          >
            <span aria-hidden className="size-2 shrink-0 rounded-full bg-vtk-yellow-dark" />
            <span className="min-w-0 flex-1 text-sm">
              <span className="font-semibold text-vtk-ink">{item.title}</span>{" "}
              <span className="text-xs text-vtk-muted">{item.text}</span>
            </span>
            <Link
              href={item.href}
              className="rounded-full border border-vtk-navy/20 px-3 py-1 text-xs font-semibold text-vtk-ink hover:bg-vtk-blue-soft/60"
            >
              {item.action}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** De open punten van een rij lijsten, als regels voor de kaart hierboven. */
export function listTodos(lists: OverviewListRow[], base: string, nl: boolean): TodoItem[] {
  const items: TodoItem[] = [];
  for (const list of lists) {
    const href = `${base}/admin/shiftenoverzicht/lijst/${list.id}`;
    if (list.status === "DRAFT") {
      items.push({
        key: `${list.id}-draft`,
        title: nl ? `${list.name} nakijken` : `Review ${list.name}`,
        text:
          list.unresolvedNames > 0
            ? nl
              ? `Opgeladen maar nog niet bevestigd; ${list.unresolvedNames} ${list.unresolvedNames === 1 ? "naam wacht" : "namen wachten"} op een keuze.`
              : `Uploaded but not confirmed; ${list.unresolvedNames} names wait for a choice.`
            : nl
              ? "Opgeladen maar nog niet bevestigd; telt nog niet mee."
              : "Uploaded but not confirmed; does not count yet.",
        href,
        action: nl ? "Nakijken" : "Review",
      });
    } else if (list.unresolvedNames > 0) {
      items.push({
        key: `${list.id}-names`,
        title: nl ? `Namen op ${list.name} kiezen` : `Choose names on ${list.name}`,
        text: nl
          ? `${list.unresolvedNames} ${list.unresolvedNames === 1 ? "naam" : "namen"} zonder keuze: ${formatCount(list.unresolvedShifts)} ${list.unresolvedShifts === 1 ? "shift telt" : "shiften tellen"} voor niemand.`
          : `${list.unresolvedNames} names without a choice: ${formatCount(list.unresolvedShifts, "en")} shifts count for nobody.`,
        href,
        action: nl ? "Kiezen" : "Choose",
      });
    }
  }
  return items;
}

function StatusChip({ list, nl }: { list: OverviewListRow; nl: boolean }) {
  const low = "bg-[var(--low-bg)] text-[var(--low-ink)]";
  const calm = "bg-[var(--paper-2)] text-vtk-body";
  const [text, tone] =
    list.status === "DRAFT"
      ? [nl ? "Nog na te kijken" : "To review", low]
      : list.unresolvedNames > 0
        ? [nl ? `${list.unresolvedNames} ${list.unresolvedNames === 1 ? "naam" : "namen"} open` : `${list.unresolvedNames} open`, low]
        : [nl ? "Bevestigd" : "Confirmed", calm];
  return <span className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${tone}`}>{text}</span>;
}

function formatDay(iso: string | null, nl: boolean): string {
  if (!iso) return "";
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(nl ? "nl-BE" : "en-GB", { day: "numeric", month: "short" });
}

/**
 * De lijsten van een jaar als kaarten: naam, status, hoeveel shiften er
 * gevuld zijn en hoe het gemiddelde lid het doet tegenover de richtlijn. Een
 * klik opent de lijst. Achteraan staat de kaart om een nieuwe op te laden.
 */
export function ListCards({
  lists,
  base,
  nl,
  upload,
}: {
  lists: OverviewListRow[];
  base: string;
  nl: boolean;
  upload: ReactNode;
}) {
  const locale = nl ? "nl" : "en";
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
      {lists.map((list) => {
        const expected = list.expectedPerMember;
        const pct = expected ? Math.min(100, (list.average / expected) * 100) : null;
        const meta = [
          formatDay(list.eventDate, nl),
          list.kind === "WEEKLY"
            ? nl
              ? `${formatCount(list.counted)} praesidiumshiften`
              : `${formatCount(list.counted, "en")} praesidium shifts`
            : nl
              ? `${formatCount(list.counted)} VTK-shiften`
              : `${formatCount(list.counted, "en")} VTK shifts`,
          list.openSlots !== null && list.openSlots > 0 ? (nl ? `nog ${list.openSlots} open` : `${list.openSlots} still open`) : null,
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <Link
            key={list.id}
            href={`${base}/admin/shiftenoverzicht/lijst/${list.id}`}
            className="grid min-w-0 content-start gap-2.5 rounded-[18px] border border-vtk-blue/10 bg-vtk-surface-elevated p-4 transition-colors hover:border-vtk-navy/25"
          >
            <span className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
              <span className="min-w-0 break-words text-[15px] font-semibold leading-snug text-vtk-ink">{list.name}</span>
              <StatusChip list={list} nl={nl} />
            </span>
            <span className="text-xs text-vtk-muted">{meta}</span>
            <span className="grid min-w-0 gap-1.5">
              <span className="flex items-baseline justify-between gap-2 text-xs">
                <span className="text-vtk-muted">{nl ? "gem. per lid" : "avg. per member"}</span>
                <span className="font-semibold tabular-nums text-vtk-ink">
                  {formatCount(list.average, locale)}
                  {expected !== null && (
                    <span className="font-medium text-vtk-muted">
                      {" "}
                      / {formatCount(expected, locale)}
                    </span>
                  )}
                </span>
              </span>
              {pct !== null ? (
                <span className="relative h-1.5 rounded-full bg-[var(--paper-2)]" aria-hidden>
                  <span className="absolute inset-y-0 left-0 rounded-full bg-[var(--chart-1)]" style={{ width: `${pct}%` }} />
                  <span className="absolute -inset-y-[3px] right-0 w-0.5 rounded-full bg-vtk-ink" />
                </span>
              ) : (
                <span className="text-[11px] text-vtk-muted">{nl ? "geen richtlijn" : "no target"}</span>
              )}
              {expected !== null && list.metTarget !== null && (
                <span className="text-[11px] text-vtk-muted">
                  {nl
                    ? `${list.metTarget} van ${list.participants} halen de richtlijn`
                    : `${list.metTarget} of ${list.participants} reach the target`}
                  {list.skipped > 0 && (nl ? ` · ${list.skipped} overgeslagen` : ` · ${list.skipped} skipped`)}
                </span>
              )}
            </span>
          </Link>
        );
      })}
      {upload}
    </div>
  );
}
