import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { Card } from "@vtk/ui";
import type { Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { requireAnyPermission } from "@/lib/session";
import { brusselsMinutesOfDay, brusselsYMD, ymdKey } from "@/lib/brussels";
import { Markdown } from "@/components/ui/Markdown";
import {
  blocksRoom,
  isOpenRental,
  RENTAL_STATUS_META,
} from "@/lib/theokotVerhuur";
import {
  depositChoiceLabel,
  formatRentalMoment,
  getRentalConfig,
  getRentalGuide,
  getRentalQuestions,
  getRentalTemplates,
  rentalSenderLabel,
} from "@/lib/theokotVerhuur-server";
import { rentalMailVars } from "@/lib/theokotVerhuurMail";
import {
  currentWorkingYear,
  formatWorkingYear,
  parseWorkingYear,
  workingYearStart,
  workingYearTabs,
} from "@/lib/workingYear";
import { RentalBoard } from "./RentalBoard";
import {
  RentalConfigCard,
  RentalContractsCard,
  RentalGuideCard,
  RentalQuestionsCard,
} from "./RentalSettingsCards";
import { RentalTemplatesCard } from "./RentalTemplatesCard";
import type { ContractDocView, RentalView } from "./types";

import "@/app/design/vtk-theokot-verhuur.css";

/**
 * Beheer van de Theokot-verhuur: de aanvragen die nog werk vragen, dezelfde
 * aanvragen als kalender, en de vaste gegevens eromheen (vragen, sjablonen,
 * huurcontracten, richtlijnen).
 *
 * Dit vervangt een Google Form met een Sheet ernaast. De volgorde van de tabs
 * volgt de weg die een aanvraag aflegt; zie docs/design-decisions.md
 * ("Theokot-verhuur").
 */

const TABS = ["aanvragen", "verwerkt", "kalender", "instellingen"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, { nl: string; en: string }> = {
  aanvragen: { nl: "Aanvragen", en: "Requests" },
  verwerkt: { nl: "Verwerkt", en: "Processed" },
  kalender: { nl: "Kalender", en: "Calendar" },
  instellingen: { nl: "Instellingen", en: "Settings" },
};

export default async function AdminTheokotVerhuurPage({
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

  const session = await requireAnyPermission(["theokot.rentals.view", "theokot.rentals.manage"]);
  const canManage =
    session.user.isSuperAdmin || session.permissions.includes("theokot.rentals.manage");

  const { tab: tabParam, jaar } = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(tabParam ?? "")
    ? (tabParam as Tab)
    : "aanvragen";
  const year = parseWorkingYear(jaar);

  // Het venster van één werkingsjaar (15 juli tot 15 juli). Alle aanvragen van
  // dat jaar gaan in één keer naar de client: het zijn er hooguit een paar
  // honderd, en dan bladert de kalender tussen maanden zonder iets op te halen.
  const from = workingYearStart(year);
  const to = workingYearStart(year + 1);

  const [rows, contractRows, config, templates, questions, guide, yearRows] = await Promise.all([
    prisma.theokotRental.findMany({
      where: { startsAt: { gte: from, lt: to } },
      orderBy: { startsAt: "asc" },
      include: {
        decidedBy: { select: { name: true } },
        messages: {
          orderBy: { sentAt: "desc" },
          select: {
            id: true,
            kind: true,
            to: true,
            subject: true,
            body: true,
            attachmentName: true,
            sentAt: true,
            sentViaMail: true,
            sentBy: { select: { name: true } },
          },
        },
      },
    }),
    prisma.theokotRentalContractDoc.findMany({
      orderBy: [{ audience: "asc" }, { locale: "asc" }],
      include: { uploadedBy: { select: { name: true } } },
    }),
    getRentalConfig(),
    getRentalTemplates(),
    getRentalQuestions(),
    getRentalGuide(),
    prisma.theokotRental.findMany({
      distinct: ["startsAt"],
      select: { startsAt: true },
      orderBy: { startsAt: "asc" },
    }),
  ]);

  const dateFmt = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const shortFmt = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const momentFmt = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const timeFmt = new Intl.DateTimeFormat("nl-BE", {
    timeZone: "Europe/Brussels",
    hour: "2-digit",
    minute: "2-digit",
  });

  const extraById = new Map(questions.extra.map((question) => [question.id, question]));

  const rentals: RentalView[] = rows.map((row) => {
    const startYmd = brusselsYMD(row.startsAt);
    const endYmd = brusselsYMD(row.endsAt);
    const startDay = ymdKey(startYmd);
    const minutes = brusselsMinutesOfDay(row.startsAt);
    // Een verhuur die na middernacht stopt, valt op een andere kalenderdag. Het
    // raster rekent in minuten sinds middernacht van de startdag, dus die
    // volgende dag telt als +1440.
    const endMinutes =
      brusselsMinutesOfDay(row.endsAt) + (ymdKey(endYmd) === startDay ? 0 : 24 * 60);

    const mailLocale = row.locale === "en" ? "en" : "nl";
    const answers = (row.extraAnswers ?? {}) as Record<string, string>;

    const clashes = rows
      .filter(
        (other) =>
          other.id !== row.id &&
          blocksRoom(other.status) &&
          other.startsAt < row.endsAt &&
          row.startsAt < other.endsAt,
      )
      .map((other) => ({
        id: other.id,
        label: `${other.responsibleName} (${RENTAL_STATUS_META[other.status][nl ? "nl" : "en"]}, ${timeFmt.format(other.startsAt)}–${timeFmt.format(other.endsAt)})`,
      }));

    const mailStart = formatRentalMoment(row.startsAt, mailLocale);
    const mailEnd = formatRentalMoment(row.endsAt, mailLocale);

    return {
      id: row.id,
      day: startDay,
      minutes,
      endMinutes,
      dateInput: startDay,
      startInput: timeFmt.format(row.startsAt),
      endInput: timeFmt.format(row.endsAt),
      dateLabel: dateFmt.format(row.startsAt),
      dayLabel: shortFmt.format(row.startsAt),
      timeLabel: `${timeFmt.format(row.startsAt)} – ${timeFmt.format(row.endsAt)}`,
      status: row.status,
      deposit: row.deposit,
      contract: row.contract,
      keyStatus: row.keyStatus,
      renterType: row.renterType,
      depositChoice: row.depositChoice,
      responsibleName: row.responsibleName,
      email: row.email,
      phone: row.phone,
      purpose: row.purpose,
      attendees: row.attendees,
      remarks: row.remarks,
      extraAnswers: Object.entries(answers)
        .filter(([, value]) => Boolean(value))
        .map(([id, value]) => ({
          id,
          // Een vraag die intussen weggehaald is, houdt haar antwoord: dan toont
          // het paneel de sleutel in plaats van niets.
          label: extraById.get(id)?.[nl ? "labelNl" : "labelEn"] || extraById.get(id)?.labelNl || id,
          value,
        })),
      internalNote: row.internalNote,
      decisionNote: row.decisionNote,
      locale: mailLocale,
      decidedAtLabel: row.decidedAt ? momentFmt.format(row.decidedAt) : null,
      decidedByName: row.decidedBy?.name ?? null,
      decidedViaMail: row.decidedViaMail,
      requesterNotifiedAtLabel: row.requesterNotifiedAt
        ? momentFmt.format(row.requesterNotifiedAt)
        : null,
      createdAtLabel: momentFmt.format(row.createdAt),
      clashes,
      messages: row.messages.map((message) => ({
        id: message.id,
        kind: message.kind,
        to: message.to,
        subject: message.subject,
        body: message.body,
        attachmentName: message.attachmentName,
        sentAtLabel: momentFmt.format(message.sentAt),
        sentByName: message.sentBy?.name ?? null,
        sentViaMail: message.sentViaMail,
      })),
      // De ondertekening komt er in het paneel bij; die staat los in de
      // instellingen en mag daar veranderen zonder dat elke rij herberekend wordt.
      mailVars: rentalMailVars(
        {
          responsibleName: row.responsibleName,
          mailDate: mailStart.date,
          startTime: mailStart.time,
          endTime: mailEnd.time,
          purpose: row.purpose,
          attendees: row.attendees,
          depositChoice: row.depositChoice,
          depositLabel: depositChoiceLabel(row.depositChoice, mailLocale),
          remarks: row.remarks,
          decisionNote: row.decisionNote,
        },
        "",
      ) as Record<string, string>,
    };
  });

  const contracts: ContractDocView[] = contractRows.map((row) => ({
    id: row.id,
    audience: row.audience,
    locale: row.locale,
    fileName: row.fileName,
    sizeBytes: row.sizeBytes,
    uploadedAtLabel: momentFmt.format(row.uploadedAt),
    uploadedByName: row.uploadedBy?.name ?? null,
    href: `/api/media/${row.storageKey}`,
  }));

  const contractAvailable: Record<string, boolean> = {};
  for (const row of contractRows) contractAvailable[`${row.audience}:${row.locale}`] = true;

  const open = rentals.filter((rental) => isOpenRental(rental.status));
  const processed = rentals.filter((rental) => !isOpenRental(rental.status));
  const unanswered = rentals.filter((rental) => rental.status === "UNANSWERED").length;

  const years = workingYearTabs(
    yearRows.map((row) => {
      const { year: y, month } = brusselsYMD(row.startsAt);
      // Het werkingsjaar begint op 15 juli; alles vóór juli hoort bij het vorige.
      return month >= 8 ? y : y - 1;
    }),
  );

  const tabHref = (next: Tab) =>
    `${base}/admin/theokot/verhuur?tab=${next}${year === currentWorkingYear() ? "" : `&jaar=${year}`}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold">
          {nl ? "Theokot verhuren" : "Theokot rentals"} · {formatWorkingYear(year)}
        </h1>
        <Link
          href={`${base}/theokot/verhuur`}
          className="text-sm font-semibold text-vtk-ink underline underline-offset-4"
        >
          {nl ? "Het publieke formulier bekijken" : "View the public form"}
        </Link>
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
            {value === "aanvragen" && open.length > 0 ? ` (${open.length})` : ""}
            {value === "verwerkt" && processed.length > 0 ? ` (${processed.length})` : ""}
          </Link>
        ))}
      </nav>

      {years.length > 1 && (
        <nav className="flex flex-wrap gap-2" aria-label={nl ? "Werkingsjaar" : "Working year"}>
          {years.map((value) => (
            <Link
              key={value}
              href={`${base}/admin/theokot/verhuur?tab=${tab}&jaar=${value}`}
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
          <RentalConfigCard nl={nl} config={config} />
          <RentalQuestionsCard nl={nl} questions={questions} />
          <RentalTemplatesCard
            nl={nl}
            templates={templates}
            senderLabel={rentalSenderLabel()}
            signature={config.signature}
            replyTo={config.replyTo}
          />
          <RentalContractsCard nl={nl} contracts={contracts} />
          <RentalGuideCard nl={nl} guide={guide} />
        </>
      ) : (
        <>
          {tab === "aanvragen" && guide.handbook.trim() && (
            <Card className="p-5">
              <details>
                <summary className="cursor-pointer list-none text-sm font-semibold text-vtk-ink">
                  {nl ? "Handleiding: hoe je een aanvraag behandelt" : "Handbook: how to handle a request"}
                  {unanswered > 0 && (
                    <span className="ml-2 text-xs font-normal text-[#5c667f]">
                      {nl
                        ? `${unanswered} ${unanswered === 1 ? "aanvraag wacht" : "aanvragen wachten"} op een antwoord`
                        : `${unanswered} ${unanswered === 1 ? "request is" : "requests are"} waiting for an answer`}
                    </span>
                  )}
                </summary>
                <div className="prose-vtk mt-3 border-t border-vtk-blue/10 pt-3">
                  <Markdown>{guide.handbook}</Markdown>
                </div>
              </details>
            </Card>
          )}

          <RentalBoard
            nl={nl}
            mode={tab === "kalender" ? "calendar" : tab === "verwerkt" ? "processed" : "queue"}
            rentals={tab === "kalender" ? rentals : tab === "verwerkt" ? processed : open}
            templates={templates}
            senderLabel={rentalSenderLabel()}
            signature={config.signature}
            contractAvailable={contractAvailable}
            canManage={canManage}
            emptyMessage={
              tab === "verwerkt"
                ? nl
                  ? "Nog niets verwerkt dit werkingsjaar."
                  : "Nothing processed this working year yet."
                : nl
                  ? "Geen openstaande aanvragen. Alles is beantwoord en afgerond."
                  : "No open requests. Everything is answered and wrapped up."
            }
          />
        </>
      )}
    </div>
  );
}
