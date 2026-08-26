import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { Card } from "@vtk/ui";
import type { Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { requireAnyPermission } from "@/lib/session";
import { brusselsMinutesOfDay, brusselsYMD, ymdKey } from "@/lib/brussels";
import {
  defaultTeacherLocale,
  matchPeculiarities,
  type LesbezoekStatusCode,
} from "@/lib/lesbezoeken";
import {
  formatMailMoment,
  getLesbezoekConfig,
  getLesbezoekTemplates,
} from "@/lib/lesbezoeken-server";
import {
  currentWorkingYear,
  formatWorkingYear,
  parseWorkingYear,
  workingYearStart,
  workingYearTabs,
} from "@/lib/workingYear";
import { LesbezoekBoard } from "./LesbezoekBoard";
import { OrganisationsCard } from "./OrganisationsCard";
import { PeculiaritiesCard } from "./PeculiaritiesCard";
import { MailSettingsCard } from "./MailSettingsCard";
import type { OrganisationView, PeculiarityView, VisitView } from "./types";

import "@/app/design/vtk-lesbezoeken.css";

/**
 * Beheer van de lesbezoeken: de werklijst met wat er nog moet gebeuren, dezelfde
 * bezoeken als kalender, en de vaste gegevens eromheen (organisaties,
 * bijzonderheden per professor, mailsjablonen).
 *
 * Dit vervangt een Google Form, een Sheet met acht tabbladen en een mailmerge.
 * De volgorde van de tabs volgt de weg die een aanvraag aflegt; zie
 * docs/design-decisions.md ("Lesbezoeken").
 */

const TABS = ["aanvragen", "goedgekeurd", "kalender", "instellingen"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, { nl: string; en: string }> = {
  aanvragen: { nl: "Aanvragen", en: "Requests" },
  goedgekeurd: { nl: "Goedgekeurd", en: "Approved" },
  kalender: { nl: "Kalender", en: "Calendar" },
  instellingen: { nl: "Organisaties & mails", en: "Organisations & mail" },
};

/** Statussen die als "hier moet nog iets mee gebeuren" tellen, voor de teller. */
const OPEN_STATUSES: LesbezoekStatusCode[] = ["PENDING", "ASKED"];

export default async function AdminLesbezoekenPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string; jaar?: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";

  const session = await requireAnyPermission(["lesbezoeken.view", "lesbezoeken.manage"]);
  const canManage =
    session.user.isSuperAdmin || session.permissions.includes("lesbezoeken.manage");

  const { tab: tabParam, jaar } = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(tabParam ?? "") ? (tabParam as Tab) : "aanvragen";
  const year = parseWorkingYear(jaar);

  // Het venster van één werkingsjaar (15 juli tot 15 juli). Alle bezoeken van dat
  // jaar gaan in één keer naar de client: het zijn er een paar honderd, en dan
  // navigeert de kalender tussen maanden zonder telkens iets op te halen.
  const from = workingYearStart(year);
  const to = workingYearStart(year + 1);

  const [visitRows, organisationRows, peculiarityRows, config, templates, yearRows] =
    await Promise.all([
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

  const visits: VisitView[] = visitRows.map((row) => {
    const day = ymdKey(brusselsYMD(row.startsAt));
    const minutes = brusselsMinutesOfDay(row.startsAt);
    const endMinutes = brusselsMinutesOfDay(row.endsAt);
    const clashKey = `${row.teacherEmail.toLowerCase()}|${day}`;

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
    };
  });

  const openCount = visits.filter((visit) => OPEN_STATUSES.includes(visit.status)).length;
  const approvedCount = visits.filter((visit) => visit.status === "APPROVED").length;
  const years = workingYearTabs(
    yearRows.map((row) => {
      const { year: y, month } = brusselsYMD(row.startsAt);
      // Het werkingsjaar begint op 15 juli; alles vóór juli hoort bij het vorige.
      return month >= 8 ? y : y - 1;
    }),
  );

  const tabHref = (next: Tab) =>
    `${base}/admin/lesbezoeken?tab=${next}${year === currentWorkingYear() ? "" : `&jaar=${year}`}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold">
          {nl ? "Lesbezoeken" : "Classroom visits"} · {formatWorkingYear(year)}
        </h1>
        <a
          href={`${base}/api/admin/lesbezoeken/ics`}
          className="text-sm font-semibold text-vtk-ink underline underline-offset-4"
        >
          {nl ? "Agenda downloaden (.ics)" : "Download calendar (.ics)"}
        </a>
      </div>

      <nav className="flex flex-wrap gap-2" aria-label={nl ? "Onderdelen" : "Sections"}>
        {TABS.map((value) => (
          <Link
            key={value}
            href={tabHref(value)}
            aria-current={value === tab ? "page" : undefined}
            className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
              value === tab
                ? "border-vtk-ink bg-vtk-ink text-white"
                : "border-vtk-blue/15 text-vtk-ink hover:bg-vtk-blue-soft/60"
            }`}
          >
            {TAB_LABELS[value][nl ? "nl" : "en"]}
            {value === "aanvragen" && openCount > 0 ? ` (${openCount})` : ""}
            {value === "goedgekeurd" && approvedCount > 0 ? ` (${approvedCount})` : ""}
          </Link>
        ))}
      </nav>

      {years.length > 1 && (
        <nav className="flex flex-wrap gap-2" aria-label={nl ? "Werkingsjaar" : "Working year"}>
          {years.map((value) => (
            <Link
              key={value}
              href={`${base}/admin/lesbezoeken?tab=${tab}&jaar=${value}`}
              aria-current={value === year ? "page" : undefined}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                value === year
                  ? "border-vtk-ink bg-vtk-blue-soft text-vtk-ink"
                  : "border-vtk-blue/15 text-[#5c667f] hover:bg-vtk-blue-soft/60"
              }`}
            >
              {formatWorkingYear(value)}
            </Link>
          ))}
        </nav>
      )}

      {tab === "instellingen" ? (
        <>
          <OrganisationsCard nl={nl} canManage={canManage} organisations={organisations} />
          <PeculiaritiesCard nl={nl} canManage={canManage} peculiarities={peculiarities} />
          <MailSettingsCard nl={nl} canManage={canManage} config={config} templates={templates} />
        </>
      ) : (
        <Card className="p-5">
          <LesbezoekBoard
            nl={nl}
            mode={tab === "kalender" ? "calendar" : tab === "goedgekeurd" ? "approved" : "queue"}
            canManage={canManage}
            visits={visits}
            organisations={organisations.filter(
              (row) => row.active || visits.some((visit) => visit.organisationId === row.id),
            )}
            templates={templates}
            signature={config.signature}
          />
        </Card>
      )}
    </div>
  );
}
