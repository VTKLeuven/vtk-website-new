import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import type { Locale } from "@vtk/i18n";
import { Card } from "@vtk/ui";
import { currentWorkingYear } from "@/lib/workingYear";
import { MEETING_DEFAULTS, semesterToPlan, type Semester } from "@/lib/meetings";
import { loadMeetingAdmin } from "@/lib/meetingAdmin";
import { MeetingAdminCard } from "@/components/meetings/MeetingAdminCard";
import { MeetingPlanner } from "@/components/meetings/MeetingPlanner";
import { NewMeetingCard } from "@/components/meetings/NewMeetingCard";
import { SemesterTabs } from "@/components/meetings/SemesterTabs";

/**
 * Tabblad Vergaderingen: de kalender van een semester en de vergaderingen zelf
 * met hun bestellingen. Het werk van elke week, dus het eerste tabblad.
 */
export default async function AdminGrocomeetPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ semester?: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  await requirePermission("grocomeet.manage");

  const { semester: semesterParam } = await searchParams;
  const workingYear = currentWorkingYear();
  const semester: Semester = semesterParam === "1" || semesterParam === "2" ? Number(semesterParam) as Semester : semesterToPlan();

  const { meetings, planned, hasPlan } = await loadMeetingAdmin("GROCOMEET", { locale, workingYear, semester });

  return (
    <div className="space-y-5">
      <SemesterTabs nl={nl} base={`${nl ? "" : "/en"}/admin/grocomeet`} semester={semester} />

      <Card className="p-5">
        <h2 className="mb-1 text-lg font-semibold">
          {nl ? `Kalender semester ${semester}` : `Calendar semester ${semester}`}
        </h2>
        <p className="mb-4 text-sm text-[#5c667f]">
          {hasPlan
            ? nl
              ? "Duid aan op welke dagen er een grocomeet is. Dagen waarvoor al besteld is, kan je hier niet weghalen."
              : "Mark the days with a grocomeet. Days that already have orders cannot be removed here."
            : nl
              ? "De kalender van dit semester staat nog niet vast. Duid aan op welke dagen er een grocomeet is; het voorstel hieronder volgt het gewone ritme."
              : "This semester's calendar is not set yet. Mark the days with a grocomeet; the suggestion below follows the usual rhythm."}
        </p>
        {/* Een eigen `key` per semester: de planner bewaart zijn selectie in
            state, en die bleef bij het wisselen van tab staan. Opslaan zette
            dan de dagen van het andere semester er een tweede keer in. */}
        <MeetingPlanner
          key={`${workingYear}-${semester}`}
          nl={nl}
          kind="GROCOMEET"
          year={workingYear}
          semester={semester}
          planned={planned}
          defaultTime={MEETING_DEFAULTS.GROCOMEET.time}
        />
      </Card>

      <NewMeetingCard nl={nl} kind="GROCOMEET" year={workingYear} />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">{nl ? "Vergaderingen" : "Meetings"}</h2>
        {meetings.length === 0 ? (
          <div className="vtk-basic-empty">
            {nl ? "Nog geen grocomeets in dit semester." : "No grocomeets in this semester yet."}
          </div>
        ) : (
          meetings.map((meeting) => <MeetingAdminCard key={meeting.id} nl={nl} meeting={meeting} />)
        )}
      </div>
    </div>
  );
}
