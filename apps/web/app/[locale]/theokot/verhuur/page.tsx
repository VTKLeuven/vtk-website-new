import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { getDictionary, type Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { staticMetadata } from "@/lib/pageMetadata";
import { Markdown } from "@/components/ui/Markdown";
import { brusselsWallClockMinutes, brusselsYMD, shiftYMD, ymdKey } from "@/lib/brussels";
import { PUBLIC_BUSY_STATUSES } from "@/lib/theokotVerhuur";
import { getRentalConfig, getRentalGuide, getRentalQuestions } from "@/lib/theokotVerhuur-server";
import { rentalContactEmail } from "@/lib/theokotVerhuurMail";
import { PublicRentalCalendar } from "@/components/theokot/PublicRentalCalendar";
import { toPublicRentalSlots } from "@/components/theokot/publicRentalSlots";
import { RentalRequestForm } from "./RentalRequestForm";

import "@/app/design/vtk-base.css";
import "@/app/design/vtk-theokot-verhuur.css";

/**
 * `/theokot/verhuur`: het publieke aanvraagformulier voor de zaal.
 *
 * Bewust zonder login. De verantwoordelijke moet student aan de faculteit zijn,
 * maar lang niet elke student heeft een VTK-account, en die een account laten
 * maken om één zaal te vragen zou het formulier vervangen door een drempel. De
 * bescherming is dezelfde als bij het contactformulier (honeypot +
 * snelheidslimiet), en elke aanvraag komt hoe dan ook eerst bij Theokot terecht
 * voor er iets vastligt.
 *
 * De richtlijnen ernaast worden in het beheer geschreven. Ze stonden vroeger
 * verspreid over de vraagteksten van een Google Form, waar niemand ze twee keer
 * las.
 *
 * Boven het formulier staat de beschikbaarheidskalender. Die stond er eerst niet
 * op, en dat was een vergissing: wie niet kan zien of zijn avond nog vrij is,
 * vraagt ze aan, en Theokot mocht de dubbele aanvragen met de hand weigeren. Ze
 * toont enkel wat de zaal echt bezet houdt (zie `PUBLIC_BUSY_STATUSES`) en
 * standaard zonder namen; zie `components/theokot/PublicRentalCalendar.tsx`.
 */

type Params = Promise<{ locale: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(locale)) return {};
  return staticMetadata("theokotVerhuur", "/theokot/verhuur", locale);
}

export default async function TheokotVerhuurPage({ params }: { params: Params }) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const t = getDictionary(locale).theokotVerhuur;

  const [config, questions, guide] = await Promise.all([
    getRentalConfig(),
    getRentalQuestions(),
    getRentalGuide(),
  ]);

  // Vandaag in Brussel, en niet in de tijdzone van de server: de kalender
  // markeert er vandaag mee en leidt er de wachttijd uit af.
  const now = new Date();
  const todayYmd = brusselsYMD(now);
  const todayKey = ymdKey(todayYmd);
  const earliestKey = config.formOpen
    ? ymdKey(shiftYMD(todayYmd, Math.max(0, config.minLeadDays)))
    : null;

  // Het venster loopt van vorige maand (een verhuur van de 31e die tot 03:00
  // doorloopt, hoort nog mee) tot ruim een jaar verder, verder dan er te bladeren
  // valt. In dagen en niet met setMonth: die rekent in de tijdzone van de server,
  // en een venster dat in maart een uur verspringt kijkt niemand ooit na.
  const firstOfMonth = { year: todayYmd.year, month: todayYmd.month, day: 1 };
  const windowFrom = brusselsWallClockMinutes(shiftYMD(firstOfMonth, -40), 0);
  const windowTo = brusselsWallClockMinutes(shiftYMD(firstOfMonth, 430), 0);

  // Enkel wat publiek mag: geen naam, geen adres, geen telefoonnummer, geen
  // notitie. Wat hier niet uit de database komt, kan ook niet per ongeluk in de
  // HTML van de pagina belanden.
  const busyRows = await prisma.theokotRental.findMany({
    where: {
      status: { in: [...PUBLIC_BUSY_STATUSES] },
      startsAt: { gte: windowFrom, lt: windowTo },
    },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      purpose: true,
      purposePublic: true,
    },
  });

  const timeFmt = new Intl.DateTimeFormat("nl-BE", {
    timeZone: "Europe/Brussels",
    hour: "2-digit",
    minute: "2-digit",
  });
  const dayFmt = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const busySlots = toPublicRentalSlots(busyRows, {
    time: (date) => timeFmt.format(date),
    day: (date) => dayFmt.format(date),
  });

  const contactEmail = rentalContactEmail(config);
  const guidelines = nl ? guide.guidelinesNl : guide.guidelinesEn || guide.guidelinesNl;
  const closedNotice = nl ? config.closedNoticeNl : config.closedNoticeEn;

  return (
    <div className="vtk-page">
      <header className="vtk-page-head">
        <div>
          <h1 className="vtk-page-title">{t.title}</h1>
          <p className="vtk-page-subtitle">{t.subtitle}</p>
        </div>
      </header>

      <div className="vtk-page-shell">
        {/* Eerst kijken of de avond vrij is, dan pas invullen: in die volgorde
            scheelt het een aanvraag die toch geweigerd wordt. */}
        <section className="vtk-panel tv-panel tv-avail-panel" aria-labelledby="tv-avail-title">
          <h2 id="tv-avail-title">{t.availabilityTitle}</h2>
          <PublicRentalCalendar
            nl={nl}
            slots={busySlots}
            todayKey={todayKey}
            earliestKey={earliestKey}
            copy={{
              intro: t.availabilityIntro,
              previous: t.availabilityPrevious,
              next: t.availabilityNext,
              today: t.availabilityToday,
              free: t.availabilityFree,
              busy: t.availabilityBusy,
              soon: t.availabilitySoon,
              past: t.availabilityPast,
              closedForRequests: t.availabilityClosed,
              listTitle: t.availabilityListTitle,
              listEmpty: t.availabilityListEmpty,
              leadNote:
                config.formOpen && config.minLeadDays > 0
                  ? t.availabilityLead.replace("{dagen}", String(config.minLeadDays))
                  : null,
            }}
          />
        </section>

        <div className="tv-grid">
          <section className="vtk-panel tv-panel" aria-labelledby="tv-form-title">
            <h2 id="tv-form-title">{config.formOpen ? t.formTitle : t.closedTitle}</h2>
            {config.formOpen ? (
              <RentalRequestForm
                nl={nl}
                questions={questions}
                minLeadDays={config.minLeadDays}
                copy={{
                  formIntro: t.formIntro,
                  sectionContact: t.sectionContact,
                  sectionWhen: t.sectionWhen,
                  sectionEvent: t.sectionEvent,
                  sectionExtra: t.sectionExtra,
                  honeypotLabel: t.honeypotLabel,
                  submit: t.submit,
                  submitting: t.submitting,
                  sent: t.sent,
                  newRequest: t.newRequest,
                  depositTransfer: t.depositTransfer,
                  depositCash: t.depositCash,
                  depositNvt: t.depositNvt,
                  languageNl: t.languageNl,
                  languageEn: t.languageEn,
                  errorFallback: t.errorFallback,
                }}
              />
            ) : (
              // Dicht is een echte toestand en geen fout: dan staat er wat er aan
              // de hand is, met het adres eronder, in plaats van een formulier dat
              // elke inzending weigert.
              <p className="tv-lead">{closedNotice.trim() || t.closedBody}</p>
            )}
          </section>

          <aside className="tv-aside">
            {guidelines.trim() && (
              <div className="vtk-panel tv-side">
                <h2>{t.guidelinesTitle}</h2>
                <div className="prose-vtk">
                  <Markdown locale={locale}>{guidelines}</Markdown>
                </div>
              </div>
            )}
            <div className="vtk-panel tv-side">
              <h2>{t.contactTitle}</h2>
              <p>
                {t.contactBody}{" "}
                <a className="vtk-link" href={`mailto:${contactEmail}`}>
                  {contactEmail}
                </a>
                .
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
