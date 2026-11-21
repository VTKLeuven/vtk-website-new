import Link from "@/components/ui/Link";
import { formatWorkingYear, currentWorkingYear } from "@/lib/workingYear";
import type { AttendanceStatus } from "@/lib/bo/attendance/parse";
import type { Cell, Counts } from "@/lib/bo/attendance/stats";

/*
 * Wat de tabbladen van /admin/apps/aanwezigheden delen. Geen clientcode: de
 * pagina's zijn servercomponenten, enkel de personentabel sorteert in de browser.
 *
 * Een status is nooit enkel een kleur (WCAG 1.4.1): elk vakje draagt ook een
 * letter (A, V, X) en een tooltip, en de legende staat erbij.
 */

export function attendanceBase(nl: boolean): string {
  return `${nl ? "" : "/en"}/admin/apps/aanwezigheden`;
}

/** Het gekozen werkingsjaar: uit `?jaar=` als er verslagen zijn, anders het lopende of het laatste met verslagen. */
export function resolveYear(raw: string | undefined, years: number[]): number {
  const asked = Number(raw);
  if (years.includes(asked)) return asked;
  const current = currentWorkingYear();
  return years.includes(current) || years.length === 0 ? current : years[0];
}

/** Een link binnen de module die het jaar meeneemt, behalve het lopende. */
export function withYear(href: string, year: number): string {
  return year === currentWorkingYear() ? href : `${href}?jaar=${year}`;
}

export function pct(rate: number | null): string {
  return rate === null ? "–" : `${Math.round(rate * 100)}%`;
}

export const STATUS_LETTER: Record<AttendanceStatus | "UNKNOWN", string> = {
  PRESENT: "A",
  EXCUSED: "V",
  ABSENT: "X",
  UNKNOWN: "?",
};

export function statusLabel(status: AttendanceStatus | "UNKNOWN", nl: boolean): string {
  switch (status) {
    case "PRESENT":
      return nl ? "Aanwezig" : "Present";
    case "EXCUSED":
      return nl ? "Verontschuldigd" : "Excused";
    case "ABSENT":
      return nl ? "Afwezig" : "Absent";
    default:
      return nl ? "Geen kleur in het verslag" : "No colour in the minutes";
  }
}

/** Eén vakje van een tijdlijn: een letter op de kleur van de status. */
export function StatusCell({ cell, nl, title }: { cell: Cell; nl: boolean; title?: string }) {
  if (cell === null) {
    const label = nl ? "Niet in het verslag" : "Not in the minutes";
    return (
      <span className="bo-att-cell" data-status="none" title={title ? `${title}: ${label}` : label}>
        <span aria-hidden="true">·</span>
        <span className="sr-only">{title ? `${title}: ${label}` : label}</span>
      </span>
    );
  }
  const label = statusLabel(cell, nl);
  return (
    <span className="bo-att-cell" data-status={cell.toLowerCase()} title={title ? `${title}: ${label}` : label}>
      <span aria-hidden="true">{STATUS_LETTER[cell]}</span>
      <span className="sr-only">{title ? `${title}: ${label}` : label}</span>
    </span>
  );
}

export function Legend({ nl }: { nl: boolean }) {
  return (
    <ul className="bo-att-legend" aria-label={nl ? "Legende" : "Legend"}>
      {(["PRESENT", "EXCUSED", "ABSENT"] as const).map((status) => (
        <li key={status}>
          <span className="bo-att-cell" data-status={status.toLowerCase()} aria-hidden="true">
            {STATUS_LETTER[status]}
          </span>
          {statusLabel(status, nl)}
        </li>
      ))}
      <li>
        <span className="bo-att-cell" data-status="none" aria-hidden="true">
          ·
        </span>
        {nl ? "Niet in het verslag" : "Not in the minutes"}
      </li>
    </ul>
  );
}

/** Aanwezig, verontschuldigd en afwezig als één gestapelde balk. De getallen staan er altijd naast. */
export function StackBar({ counts, nl }: { counts: Counts; nl: boolean }) {
  const total = counts.present + counts.excused + counts.absent;
  if (total === 0) return <span className="bo-att-stack" data-empty="true" />;
  const part = (n: number) => `${(n / total) * 100}%`;
  return (
    <span
      className="bo-att-stack"
      role="img"
      aria-label={
        nl
          ? `${counts.present} aanwezig, ${counts.excused} verontschuldigd, ${counts.absent} afwezig`
          : `${counts.present} present, ${counts.excused} excused, ${counts.absent} absent`
      }
    >
      <span data-status="present" style={{ width: part(counts.present) }} />
      <span data-status="excused" style={{ width: part(counts.excused) }} />
      <span data-status="absent" style={{ width: part(counts.absent) }} />
    </span>
  );
}

/** Een graad als balkje met het percentage erachter. */
export function RateBar({ rate, average }: { rate: number | null; average?: number | null }) {
  return (
    <span className="bo-att-rate">
      <span className="bo-att-rate-track" aria-hidden="true">
        {rate !== null && <span className="bo-att-rate-fill" style={{ width: `${rate * 100}%` }} />}
        {average != null && <span className="bo-att-rate-avg" style={{ left: `${average * 100}%` }} />}
      </span>
      <span className="bo-att-rate-num">{pct(rate)}</span>
    </span>
  );
}

export function YearPicker({ years, year, href, nl }: { years: number[]; year: number; href: string; nl: boolean }) {
  if (years.length < 2) return null;
  return (
    <nav className="bo-att-years" aria-label={nl ? "Werkingsjaar" : "Working year"}>
      <span>{nl ? "Jaar" : "Year"}</span>
      {years.map((y) => (
        <Link key={y} href={withYear(href, y)} aria-current={y === year ? "page" : undefined}>
          {formatWorkingYear(y)}
        </Link>
      ))}
    </nav>
  );
}

export function dayLabel(date: Date | null, nl: boolean): string {
  if (!date) return nl ? "zonder datum" : "no date";
  return new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(date);
}

export function minutesErrorText(code: string, nl: boolean): string {
  switch (code) {
    case "NOT_DOCX":
      return nl ? "Geen Google Doc of Word-bestand." : "Not a Google Doc or Word file.";
    case "NO_ATTENDANCE":
      return nl
        ? "Geen kop \"Aanwezigheden\" met gekleurde namen gevonden."
        : "No \"Aanwezigheden\" heading with coloured names found.";
    case "NO_ACCESS":
      return nl ? "Het Drive-account kan het verslag niet openen." : "The Drive account cannot open the minutes.";
    case "TOO_LARGE":
      return nl ? "Het verslag is te groot om te lezen." : "The minutes are too large to read.";
    case "DOWNLOAD_FAILED":
      return nl ? "Downloaden mislukte; de volgende scan probeert opnieuw." : "Download failed; the next scan retries.";
    default:
      return code;
  }
}
