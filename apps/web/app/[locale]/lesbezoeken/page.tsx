import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { getDictionary, type Locale } from "@vtk/i18n";
import Link from "@/components/ui/Link";
import { hasLocale } from "@/lib/locale";
import { staticMetadata } from "@/lib/pageMetadata";
import { getCurrentSession } from "@/lib/session";
import { getLesbezoekConfig } from "@/lib/lesbezoeken-server";
import { LesbezoekRequestForm } from "./LesbezoekRequestForm";
import { MyRequests } from "./MyRequests";

import "@/app/design/vtk-base.css";
import "@/app/design/vtk-lesbezoeken.css";

/**
 * `/lesbezoeken`: het publieke aanvraagformulier.
 *
 * Bewust zonder login. Wie een lesbezoek aanvraagt is lang niet altijd een
 * VTK-lid: andere kringen, studentenverenigingen en externe organisaties dienen
 * hier evengoed in, en die een account laten maken voor één vraag zou het
 * formulier vervangen door een drempel. De bescherming is dus dezelfde als bij
 * het contactformulier (honeypot + snelheidslimiet), en elke aanvraag komt hoe
 * dan ook eerst bij VTK Onderwijs terecht voor ze ergens naartoe gaat.
 *
 * De spelregels ernaast stonden vroeger in een mail met als eerste zin "sla deze
 * mail op zodat u ze gemakkelijk terug kan vinden". Dat is precies wat een pagina
 * beter doet dan een mail.
 *
 * Wie wél ingelogd is, krijgt er twee dingen bij: zijn naam, e-mailadres en
 * telefoonnummer staan al ingevuld, en boven het formulier staat wat hij eerder
 * aanvroeg en hoe ver dat staat ("Jouw aanvragen"). Zie docs/design-decisions.md
 * ("Lesbezoeken").
 */

type Params = Promise<{ locale: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(locale)) return {};
  return staticMetadata("lesbezoeken", "/lesbezoeken", locale);
}

export default async function LesbezoekenPage({ params }: { params: Params }) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const t = getDictionary(locale).lesbezoeken;
  const base = nl ? "" : "/en";

  const session = await getCurrentSession();
  const userId = session?.user.id ?? null;

  const [organisations, config, mine, profile] = await Promise.all([
    prisma.lesbezoekOrganisation.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    getLesbezoekConfig(),
    // Wat dit account aanvroeg, en wat er met zijn e-mailadres binnenkwam: het
    // formulier vroeg tot oktober 2026 geen login, dus die oude aanvragen hangen
    // enkel aan het adres. Dat adres is bevestigd (KU Leuven of de bevestigingsmail
    // bij registratie), dus wie hier inlogt, krijgt er ook de mails over.
    session
      ? prisma.lesbezoek.findMany({
          where: {
            OR: [
              { requesterId: session.user.id },
              { requesterEmail: { equals: session.user.email, mode: "insensitive" } },
            ],
          },
          orderBy: { startsAt: "desc" },
          take: 200,
          select: {
            id: true,
            startsAt: true,
            subject: true,
            course: true,
            audience: true,
            status: true,
            reviewNote: true,
            professorMailedAt: true,
            createdAt: true,
            organisation: { select: { name: true } },
          },
        })
      : Promise.resolve([]),
    userId ? prisma.user.findUnique({ where: { id: userId }, select: { phone: true } }) : null,
  ]);

  return (
    <div className="vtk-page">
      <header className="vtk-page-head">
        <div>
          <h1 className="vtk-page-title">{t.title}</h1>
          <p className="vtk-page-subtitle">{t.subtitle}</p>
        </div>
      </header>

      <div className="vtk-page-shell">
        {mine.length > 0 && <MyRequests rows={mine} now={new Date()} locale={locale} copy={t.mine} />}
        <div className="lb-grid">
          <section className="vtk-panel lb-panel" aria-labelledby="lb-form-title">
            <h2 id="lb-form-title">{t.formTitle}</h2>
            <p className="lb-lead">{t.formIntro}</p>
            {!session && (
              <p className="lb-help">
                {t.loginHint}{" "}
                <Link className="vtk-link" href={`${base}/inloggen?next=${encodeURIComponent(`${base}/lesbezoeken`)}`}>
                  {t.loginLink}
                </Link>
              </p>
            )}
            <LesbezoekRequestForm
              nl={nl}
              organisations={organisations}
              defaults={
                session
                  ? { name: session.user.name, email: session.user.email, phone: profile?.phone ?? "" }
                  : null
              }
              copy={{
                organisationLabel: t.organisationLabel,
                organisationOther: t.organisationOther,
                organisationNameLabel: t.organisationNameLabel,
                nameLabel: t.nameLabel,
                emailLabel: t.emailLabel,
                emailHelp: t.emailHelp,
                phoneLabel: t.phoneLabel,
                subjectLabel: t.subjectLabel,
                subjectPlaceholder: t.subjectPlaceholder,
                teacherNoteLabel: t.teacherNoteLabel,
                teacherNoteHelp: t.teacherNoteHelp,
                longVisitLabel: t.longVisitLabel,
                audienceLabel: t.audienceLabel,
                audienceOtherOption: t.audienceOtherOption,
                audienceOtherLabel: t.audienceOtherLabel,
                courseLabel: t.courseLabel,
                coursePlaceholder: t.coursePlaceholder,
                dateLabel: t.dateLabel,
                timeLabel: t.timeLabel,
                timeHelp: t.timeHelp,
                teacherEmailLabel: t.teacherEmailLabel,
                teacherEmailHelp: t.teacherEmailHelp,
                honeypotLabel: t.honeypotLabel,
                sectionContact: t.sectionContact,
                sectionVisit: t.sectionVisit,
                sectionClass: t.sectionClass,
                submit: t.submit,
                submitting: t.submitting,
                sent: t.sent,
                fallbackError: t.errors.fallback,
              }}
            />
          </section>

          <aside className="lb-aside">
            <div className="vtk-panel lb-side">
              <h2>{t.rulesTitle}</h2>
              <ul>
                {t.rules.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            </div>
            <div className="vtk-panel lb-side">
              <h2>{t.coursesTitle}</h2>
              <p>{t.coursesBody}</p>
            </div>
            <div className="vtk-panel lb-side">
              <h2>{t.contactTitle}</h2>
              <p>
                {t.contactBody}{" "}
                <a className="vtk-link" href={`mailto:${config.notifyEmail}`}>
                  {config.notifyEmail}
                </a>
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
