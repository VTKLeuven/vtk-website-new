import { notFound } from "next/navigation";
import type { MeetingKind } from "@prisma/client";
import type { Locale } from "@vtk/i18n";
import { Card } from "@vtk/ui";
import { BarChart3, CalendarDays, CupSoda, ListChecks, ReceiptText, Wallet } from "lucide-react";
import Link from "@/components/ui/Link";
import { LinkedRow } from "@/components/ui/LinkedRow";
import type { ModuleTab } from "@/components/admin/ModuleAdminShell";
import { currentWorkingYear } from "@/lib/workingYear";
import { formatEuro } from "@/lib/theokot";
import { MEETING_DEFAULTS, semesterToPlan, type Semester } from "@/lib/meetings";
import { loadMeetingAdmin } from "@/lib/meetingAdmin";
import { MeetingDetail } from "./MeetingDetail";
import { MeetingPlanner } from "./MeetingPlanner";
import { NewMeetingCard } from "./NewMeetingCard";
import { SemesterTabs } from "./SemesterTabs";

/**
 * De tabbladen van /admin/grocomeet en /admin/bureau. Ze draaien op dezelfde
 * code en zien er dus hetzelfde uit; enkel wat erachter zit verschilt (de GM
 * rekent af per persoon, het bureau heeft statistieken). Zie
 * docs/design-decisions.md, "Beheermodules in tabbladen".
 */

export function meetingAdminBase(kind: MeetingKind, nl: boolean): string {
  return `${nl ? "" : "/en"}/admin/${kind === "GROCOMEET" ? "grocomeet" : "bureau"}`;
}

const ICON = { "aria-hidden": true, size: 15, strokeWidth: 1.8 } as const;

export function meetingAdminTabs(kind: MeetingKind, nl: boolean): ModuleTab[] {
  const base = meetingAdminBase(kind, nl);
  const shared: ModuleTab[] = [
    {
      href: base,
      label: nl ? "Vergaderingen" : "Meetings",
      icon: <ListChecks {...ICON} />,
      segments: [null, "vergadering"],
    },
    {
      href: `${base}/planning`,
      label: nl ? "Planning" : "Planning",
      icon: <CalendarDays {...ICON} />,
      segments: ["planning"],
    },
  ];
  if (kind === "GROCOMEET") {
    return [
      ...shared,
      { href: `${base}/openstaand`, label: nl ? "Openstaand" : "Outstanding", icon: <Wallet {...ICON} />, segments: ["openstaand"] },
      { href: `${base}/overzicht`, label: nl ? "Overzicht" : "Overview", icon: <ReceiptText {...ICON} />, segments: ["overzicht"] },
      { href: `${base}/drankjes`, label: nl ? "Drankjes" : "Drinks", icon: <CupSoda {...ICON} />, segments: ["drankjes"] },
    ];
  }
  return [
    ...shared,
    { href: `${base}/totalen`, label: nl ? "Totalen" : "Totals", icon: <ReceiptText {...ICON} />, segments: ["totalen"] },
    { href: `${base}/drankjes`, label: nl ? "Drankjes" : "Drinks", icon: <CupSoda {...ICON} />, segments: ["drankjes"] },
    { href: `${base}/statistieken`, label: nl ? "Statistieken" : "Statistics", icon: <BarChart3 {...ICON} />, segments: ["statistieken"] },
  ];
}

/** `?semester=1|2`, anders het semester dat nu gepland wordt. */
export function semesterFromParam(value: string | undefined): Semester {
  return value === "1" || value === "2" ? (Number(value) as Semester) : semesterToPlan();
}

function nouns(kind: MeetingKind, nl: boolean) {
  return kind === "GROCOMEET"
    ? { plural: nl ? "grocomeets" : "grocomeets", day: nl ? "een grocomeet" : "a grocomeet" }
    : { plural: nl ? "bureaus" : "bureaus", day: nl ? "een bureau" : "a bureau" };
}

/**
 * Tabblad Vergaderingen: de vergaderingen van een semester als één tabel, en een
 * klik op een rij opent die vergadering met wat er uitgedeeld moet worden en wie
 * wat krijgt. Eerst was dit een kaart per vergadering onder elkaar, met de
 * bestellingen achter een uitklapper; met tien vergaderingen in een semester
 * vond je die van deze week niet meer terug.
 */
export async function MeetingListPage({
  kind,
  locale,
  semester,
  showPast = false,
}: {
  kind: MeetingKind;
  locale: Locale;
  semester: Semester;
  /**
   * Ook de vergaderingen die al voorbij zijn. Standaard niet: wie dit tabblad
   * opent, zoekt de volgende, en die stond onder een rij voorbije.
   */
  showPast?: boolean;
}) {
  const nl = locale === "nl";
  const base = meetingAdminBase(kind, nl);
  const { meetings: all } = await loadMeetingAdmin(kind, { locale, workingYear: currentWorkingYear(), semester });
  const pastCount = all.filter((meeting) => meeting.past).length;
  const meetings = showPast ? all : all.filter((meeting) => !meeting.past);
  const showPaid = kind === "GROCOMEET";
  const toggleHref = `${base}?semester=${semester}${showPast ? "" : "&verleden=1"}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SemesterTabs nl={nl} base={base} semester={semester} />
        {pastCount > 0 ? (
          <Link
            href={toggleHref}
            className="rounded-full border border-vtk-blue/15 px-3 py-1.5 text-sm text-vtk-ink transition-colors hover:bg-vtk-blue-soft/70"
          >
            {showPast
              ? nl
                ? `Verberg voorbije (${pastCount})`
                : `Hide past (${pastCount})`
              : nl
                ? `Toon voorbije (${pastCount})`
                : `Show past (${pastCount})`}
          </Link>
        ) : null}
      </div>
      {meetings.length === 0 && pastCount > 0 ? (
        <div className="vtk-basic-empty">
          {nl
            ? `Alle ${nouns(kind, nl).plural} van semester ${semester} zijn voorbij.`
            : `All ${nouns(kind, nl).plural} of semester ${semester} are in the past.`}
        </div>
      ) : meetings.length === 0 ? (
        <div className="vtk-basic-empty">
          {nl
            ? `Nog geen ${nouns(kind, nl).plural} in semester ${semester}. Zet ze in de kalender op het tabblad `
            : `No ${nouns(kind, nl).plural} in semester ${semester} yet. Put them in the calendar on the `}
          <Link href={`${base}/planning?semester=${semester}`} className="font-medium underline">
            Planning
          </Link>
          {nl ? "." : " tab."}
        </div>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="border-b border-vtk-blue/10 text-left text-xs text-vtk-muted">
                <th className="px-4 py-3 font-medium">{nl ? "Wanneer" : "When"}</th>
                <th className="px-4 py-3 !text-right font-medium">{nl ? "Ingeschreven" : "Registered"}</th>
                <th className="px-4 py-3 !text-right font-medium">{nl ? "Met bestelling" : "With an order"}</th>
                <th className="px-4 py-3 !text-right font-medium">{nl ? "Bedrag" : "Amount"}</th>
                {showPaid && <th className="px-4 py-3 !text-right font-medium">{nl ? "Openstaand" : "Outstanding"}</th>}
              </tr>
            </thead>
            <tbody>
              {meetings.map((meeting) => {
                const href = `${base}/vergadering/${meeting.id}`;
                return (
                  <LinkedRow
                    key={meeting.id}
                    href={href}
                    className={`cursor-pointer border-b border-vtk-blue/10 last:border-0 hover:bg-vtk-blue-soft/40 ${meeting.past ? "text-[#5c667f]" : ""}`}
                  >
                    <td className="px-4 py-3 font-medium first-letter:uppercase">
                      <Link href={href}>{meeting.dateLabel}</Link>
                      {(meeting.location || meeting.friendsBureau) && (
                        <span className="block text-xs font-normal text-[#5c667f]">
                          {[meeting.location, meeting.friendsBureau ? (nl ? "Vriendjesbureau" : "Friends bureau") : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{meeting.reservations.length}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{meeting.orderCount}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatEuro(meeting.totalCents)}</td>
                    {showPaid && (
                      <td className="px-4 py-3 text-right tabular-nums">
                        {meeting.openCents > 0 ? formatEuro(meeting.openCents) : <span className="text-[#5c667f]">—</span>}
                      </td>
                    )}
                  </LinkedRow>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

/**
 * Tabblad Planning: de kalender van een semester en een losse vergadering
 * buiten het ritme om. Allebei maken ze vergaderingen aan; wat er daarna mee
 * gebeurt, staat op het tabblad Vergaderingen.
 */
export async function MeetingPlanningPage({
  kind,
  locale,
  semester,
}: {
  kind: MeetingKind;
  locale: Locale;
  semester: Semester;
}) {
  const nl = locale === "nl";
  const workingYear = currentWorkingYear();
  const { planned, hasPlan } = await loadMeetingAdmin(kind, { locale, workingYear, semester });
  const day = nouns(kind, nl).day;

  return (
    <div className="space-y-5">
      <SemesterTabs nl={nl} base={`${meetingAdminBase(kind, nl)}/planning`} semester={semester} />

      <Card className="p-5">
        <h2 className="mb-1 text-lg font-semibold">
          {nl ? `Kalender semester ${semester}` : `Calendar semester ${semester}`}
        </h2>
        <p className="mb-4 text-sm text-[#5c667f]">
          {hasPlan
            ? nl
              ? `Duid aan op welke dagen er ${day} is. Dagen waarvoor al besteld is, kan je hier niet weghalen.`
              : `Mark the days with ${day}. Days that already have orders cannot be removed here.`
            : kind === "GROCOMEET"
              ? nl
                ? "De kalender van dit semester staat nog niet vast. Duid aan op welke dagen er een grocomeet is; het voorstel hieronder volgt het gewone ritme."
                : "This semester's calendar is not set yet. Mark the days with a grocomeet; the suggestion below follows the usual rhythm."
              : nl
                ? "De kalender van dit semester staat nog niet vast. Duid aan wanneer de bureaus doorgaan; het voorstel staat op de even weken en je wisselt met één klik naar de oneven weken."
                : "This semester's calendar is not set yet. Mark when the bureaus take place; the suggestion uses the even weeks and one click switches to the odd ones."}
        </p>
        {/* Een eigen `key` per semester: de planner bewaart zijn selectie in
            state, en die bleef bij het wisselen van tab staan. Opslaan zette
            dan de dagen van het andere semester er een tweede keer in. */}
        <MeetingPlanner
          key={`${workingYear}-${semester}`}
          nl={nl}
          kind={kind}
          year={workingYear}
          semester={semester}
          planned={planned}
          defaultTime={MEETING_DEFAULTS[kind].time}
        />
      </Card>

      <NewMeetingCard nl={nl} kind={kind} year={workingYear} />
    </div>
  );
}

/** De pagina van één vergadering, onder het tabblad Vergaderingen. */
export async function MeetingDetailPage({
  kind,
  locale,
  meetingId,
}: {
  kind: MeetingKind;
  locale: Locale;
  meetingId: string;
}) {
  const nl = locale === "nl";
  const { meetings } = await loadMeetingAdmin(kind, {
    locale,
    workingYear: currentWorkingYear(),
    semester: semesterToPlan(),
    meetingId,
  });
  const meeting = meetings[0];
  if (!meeting) notFound();
  return <MeetingDetail nl={nl} meeting={meeting} listHref={meetingAdminBase(kind, nl)} />;
}
