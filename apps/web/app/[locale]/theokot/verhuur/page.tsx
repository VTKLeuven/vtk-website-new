import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDictionary, type Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { staticMetadata } from "@/lib/pageMetadata";
import { Markdown } from "@/components/ui/Markdown";
import { getRentalConfig, getRentalGuide, getRentalQuestions } from "@/lib/theokotVerhuur-server";
import { rentalContactEmail } from "@/lib/theokotVerhuurMail";
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
        <div className="tv-grid">
          <section className="vtk-panel tv-panel" aria-labelledby="tv-form-title">
            <h2 id="tv-form-title">{config.formOpen ? t.formTitle : t.closedTitle}</h2>
            {config.formOpen ? (
              <>
                <p className="tv-lead">{t.formIntro}</p>
                <RentalRequestForm
                  nl={nl}
                  questions={questions}
                  minLeadDays={config.minLeadDays}
                  copy={{
                    sectionContact: t.sectionContact,
                    sectionWhen: t.sectionWhen,
                    sectionEvent: t.sectionEvent,
                    sectionExtra: t.sectionExtra,
                    honeypotLabel: t.honeypotLabel,
                    submit: t.submit,
                    submitting: t.submitting,
                    sent: t.sent,
                    depositTransfer: t.depositTransfer,
                    depositCash: t.depositCash,
                    depositNvt: t.depositNvt,
                    languageNl: t.languageNl,
                    languageEn: t.languageEn,
                    errorFallback: t.errorFallback,
                  }}
                />
              </>
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
                  <Markdown>{guidelines}</Markdown>
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
