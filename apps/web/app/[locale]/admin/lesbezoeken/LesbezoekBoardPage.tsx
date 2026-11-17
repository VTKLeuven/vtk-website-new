import { prisma } from "@vtk/db";
import { Card } from "@vtk/ui";
import type { Locale } from "@vtk/i18n";
import { brusselsMinutesOfDay, brusselsYMD, ymdKey } from "@/lib/brussels";
import {
  daysUntil,
  defaultTeacherLocale,
  formatScheduleMoment,
  formatScheduleShort,
  matchPeculiarities,
  needsNudgeReminder,
} from "@/lib/lesbezoeken";
import {
  formatMailMoment,
  getLesbezoekConfig,
  getLesbezoekTemplates,
  processDueLesbezoekScheduledMails,
} from "@/lib/lesbezoeken-server";
import { signatureForUser } from "@/lib/mailSignature-server";
import { parseWorkingYear, workingYearStart, workingYearTabs } from "@/lib/workingYear";
import { lesbezoekAccess } from "./access";
import { LesbezoekYearTabs } from "./LesbezoekYearTabs";
import { LesbezoekBoard } from "./LesbezoekBoard";
import type { OrganisationView, PeculiarityView, ScheduledMailView, VisitView } from "./types";

/**
 * De werklijst van de lesbezoeken, gedeeld door de tabbladen Aanvragen,
 * Verwerkt en Kalender: dezelfde bezoeken van één werkingsjaar, in een andere
 * weergave. Alle bezoeken van dat jaar gaan in één keer naar de client: het
 * zijn er een paar honderd, en dan navigeert de kalender tussen maanden zonder
 * telkens iets op te halen.
 */
export async function LesbezoekBoardPage({
  locale,
  jaar,
  mode,
  path,
}: {
  locale: Locale;
  jaar: string | undefined;
  mode: "queue" | "processed" | "calendar";
  /** Het pad van dit tabblad, voor de werkingsjaren. */
  path: string;
}) {
  const nl = locale === "nl";
  const { session, canManage } = await lesbezoekAccess();

  const year = parseWorkingYear(jaar);

  // Het venster van één werkingsjaar (15 juli tot 15 juli). Alle bezoeken van dat
  // jaar gaan in één keer naar de client: het zijn er een paar honderd, en dan
  // navigeert de kalender tussen maanden zonder telkens iets op te halen.
  const from = workingYearStart(year);
  const to = workingYearStart(year + 1);

  // Verwerk eventueel vervallen geplande mails direct bij paginalaad
  await processDueLesbezoekScheduledMails().catch((err) => {
    console.error("[lesbezoeken] fout bij verwerken van geplande mails bij paginalaad:", err);
  });

  const [
    visitRows,
    scheduledMailRows,
    organisationRows,
    peculiarityRows,
    config,
    templates,
    yearRows,
  ] = await Promise.all([
    prisma.lesbezoek.findMany({
      where: { startsAt: { gte: from, lt: to } },
      orderBy: { startsAt: "asc" },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        longVisit: true,
        audience: true,
        course: true,
        subject: true,
        teacherNote: true,
        teacherEmail: true,
        teacherName: true,
        requesterName: true,
        requesterEmail: true,
        requesterPhone: true,
        status: true,
        reviewNote: true,
        reviewedAt: true,
        professorMailedAt: true,
        professorNudgedAt: true,
        requesterNotifiedAt: true,
        createdAt: true,
        organisation: { select: { id: true, name: true, colour: true, note: true } },
        reviewedBy: { select: { name: true } },
      },
    }),
    // De geplande mails apart: een gebundelde terugkoppeling staat als één rij
    // onder haar eerste bezoek, met de rest in `bundledIds`. Genest opvragen
    // zou ze dus enkel bij dat eerste bezoek tonen, en bij de negentien andere
    // lijkt er dan niets ingepland te staan.
    prisma.lesbezoekScheduledMail.findMany({
      where: {
        sentAt: null,
        failedAt: null,
        lesbezoek: { startsAt: { gte: from, lt: to } },
      },
      orderBy: { sendAt: "asc" },
      select: {
        id: true,
        lesbezoekId: true,
        bundledIds: true,
        kind: true,
        to: true,
        cc: true,
        subject: true,
        body: true,
        sendAt: true,
        createdAt: true,
      },
    }),
    prisma.lesbezoekOrganisation.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        colour: true,
        contactEmail: true,
        note: true,
        active: true,
        _count: { select: { visits: true } },
      },
    }),
    prisma.lesbezoekPeculiarity.findMany({ orderBy: { subject: "asc" } }),
    getLesbezoekConfig(),
    getLesbezoekTemplates(),
    prisma.lesbezoek.findMany({
      distinct: ["startsAt"],
      select: { startsAt: true },
      orderBy: { startsAt: "asc" },
    }),
  ]);

  // De ondertekening onder elke mail is die van wie ze verstuurt, dus van wie nu
  // naar dit scherm kijkt. Ze wordt hier een keer opgehaald en meegegeven aan de
  // werklijst en de sjabloonvoorbeelden; zo tonen de voorbeelden exact wat deze
  // persoon straks verstuurt.
  const signature = await signatureForUser(session.user.id, nl ? "nl" : "en");

  const peculiarities: PeculiarityView[] = peculiarityRows.map((row) => ({
    id: row.id,
    subject: row.subject,
    note: row.note,
  }));

  const organisations: OrganisationView[] = organisationRows.map((row) => ({
    id: row.id,
    name: row.name,
    colour: row.colour,
    contactEmail: row.contactEmail,
    note: row.note,
    active: row.active,
    visitCount: row._count.visits,
  }));

  // Botsingen: dezelfde professor op dezelfde kalenderdag. De Sheet had hiervoor
  // een formule met een kolom ernaast die je zelf nog moest nakijken; hier zit de
  // waarschuwing bij de aanvraag zelf.
  const byTeacherDay = new Map<string, typeof visitRows>();
  for (const row of visitRows) {
    if (row.status === "REJECTED" || row.status === "CANCELLED" || row.status === "DECLINED") {
      continue;
    }
    const key = `${row.teacherEmail.toLowerCase()}|${ymdKey(brusselsYMD(row.startsAt))}`;
    const bucket = byTeacherDay.get(key);
    if (bucket) bucket.push(row);
    else byTeacherDay.set(key, [row]);
  }

  const timeFmt = new Intl.DateTimeFormat("nl-BE", {
    timeZone: "Europe/Brussels",
    hour: "2-digit",
    minute: "2-digit",
  });

  // Elke geplande mail bij elk bezoek dat ze dekt, dus ook bij de bezoeken die
  // enkel via `bundledIds` in de bundel zitten.
  const scheduledByVisit = new Map<string, ScheduledMailView[]>();
  for (const mail of scheduledMailRows) {
    const view: ScheduledMailView = {
      id: mail.id,
      kind: mail.kind as "professor" | "nudge" | "requester",
      to: mail.to,
      cc: mail.cc,
      bundledCount: 1 + mail.bundledIds.length,
      subject: mail.subject,
      body: mail.body,
      sendAt: mail.sendAt.toISOString(),
      sendAtFormatted: formatScheduleMoment(mail.sendAt, nl ? "nl" : "en"),
      sendAtShort: formatScheduleShort(mail.sendAt, nl ? "nl" : "en"),
      createdAt: mail.createdAt.toISOString(),
    };
    for (const visitId of [mail.lesbezoekId, ...mail.bundledIds]) {
      const bucket = scheduledByVisit.get(visitId);
      if (bucket) bucket.push(view);
      else scheduledByVisit.set(visitId, [view]);
    }
  }

  const now = new Date();

  const visits: VisitView[] = visitRows.map((row) => {
    const day = ymdKey(brusselsYMD(row.startsAt));
    const minutes = brusselsMinutesOfDay(row.startsAt);
    const endMinutes = brusselsMinutesOfDay(row.endsAt);
    const clashKey = `${row.teacherEmail.toLowerCase()}|${day}`;
    const scheduledMails = scheduledByVisit.get(row.id) ?? [];

    return {
      id: row.id,
      day,
      minutes,
      // Een bezoek dat over middernacht loopt bestaat niet, maar een eindtijd van
      // 00:00 zou het blokje wel naar boven klappen.
      endMinutes: endMinutes > minutes ? endMinutes : minutes + 5,
      time: timeFmt.format(row.startsAt),
      status: row.status,
      longVisit: row.longVisit,
      organisationId: row.organisation.id,
      organisationName: row.organisation.name,
      organisationColour: row.organisation.colour,
      organisationNote: row.organisation.note,
      audience: row.audience,
      course: row.course,
      subject: row.subject,
      teacherNote: row.teacherNote,
      teacherEmail: row.teacherEmail,
      teacherName: row.teacherName,
      requesterName: row.requesterName,
      requesterEmail: row.requesterEmail,
      requesterPhone: row.requesterPhone,
      reviewNote: row.reviewNote,
      reviewedBy: row.reviewedBy?.name ?? null,
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      professorMailedAt: row.professorMailedAt?.toISOString() ?? null,
      professorNudgedAt: row.professorNudgedAt?.toISOString() ?? null,
      requesterNotifiedAt: row.requesterNotifiedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      peculiarities: matchPeculiarities(peculiarities, {
        teacherEmail: row.teacherEmail,
        teacherName: row.teacherName,
        course: row.course,
        audience: row.audience,
      }),
      clashes: (byTeacherDay.get(clashKey) ?? [])
        .filter((other) => other.id !== row.id)
        .map((other) => ({
          id: other.id,
          organisation: other.organisation.name,
          course: other.course,
          time: timeFmt.format(other.startsAt),
        })),
      teacherLocale: defaultTeacherLocale(row.audience),
      mailDate: {
        nl: formatMailMoment(row.startsAt, "nl").date,
        en: formatMailMoment(row.startsAt, "en").date,
      },
      mailTime: formatMailMoment(row.startsAt, "nl").time,
      scheduledMails,
      needsNudge: needsNudgeReminder(
        {
          status: row.status,
          startsAt: row.startsAt,
          professorNudgedAt: row.professorNudgedAt,
          nudgeScheduled: scheduledMails.some((mail) => mail.kind === "nudge"),
        },
        { now, leadDays: config.nudgeLeadDays },
      ),
      daysUntil: daysUntil(row.startsAt, now),
    };
  });

  const years = workingYearTabs(
    yearRows.map((row) => {
      const { year: y, month } = brusselsYMD(row.startsAt);
      // Het werkingsjaar begint op 15 juli; alles vóór juli hoort bij het vorige.
      return month >= 8 ? y : y - 1;
    }),
  );

  return (
    <div className="space-y-5">
      <LesbezoekYearTabs nl={nl} year={year} years={years} path={path} />
      <Card className="p-5">
        <LesbezoekBoard
          nl={nl}
          mode={mode}
          canManage={canManage}
          visits={visits}
          organisations={organisations.filter(
            (row) => row.active || visits.some((visit) => visit.organisationId === row.id),
          )}
          templates={templates}
          signature={signature}
          nudgeLeadDays={config.nudgeLeadDays}
        />
      </Card>
    </div>
  );
}
