import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { pick, type Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { getCurrentSession } from "@/lib/session";
import { Markdown } from "@/components/ui/Markdown";
import { PublicForm } from "@/components/forms/public/PublicForm";
import {
  daysUntilClose,
  formAvailability,
  formConditions,
  loadPublicForm,
  offersLocale,
  toPublicFields,
  unavailableMessage,
  type FormAvailability,
} from "@/lib/forms/publicForm";
import { parseFieldConfig } from "@/lib/forms/schema";
import type { AnswerValue } from "@/lib/forms/visibility";

import "@/app/design/vtk-forms.css";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!hasLocale(locale)) return {};
  const form = await prisma.form.findUnique({
    where: { slug },
    select: { titleNl: true, titleEn: true, status: true },
  });
  if (!form) return {};
  return {
    title: pick(form.titleNl, form.titleEn, locale),
    // Een formulier is geen inhoud om te vinden in Google; het is een actie met
    // een deadline, en een verlopen formulier in de resultaten helpt niemand.
    robots: { index: false, follow: true },
  };
}

function reasonCopy(
  availability: FormAvailability,
  locale: Locale,
  form: { closesAt: Date | null; opensAt: Date | null }
): { title: string; body: string } {
  const nl = locale === "nl";
  const when = (date: Date | null) =>
    date
      ? new Intl.DateTimeFormat(nl ? "nl-BE" : "en-BE", {
          dateStyle: "full",
          timeStyle: "short",
          timeZone: "Europe/Brussels",
        }).format(date)
      : "";

  switch (availability) {
    case "NOT_OPEN_YET":
      return {
        title: nl ? "Nog niet open" : "Not open yet",
        body: nl
          ? `Dit formulier opent op ${when(form.opensAt)}.`
          : `This form opens on ${when(form.opensAt)}.`,
      };
    case "CLOSED":
      return {
        title: nl ? "Gesloten" : "Closed",
        body: nl
          ? `Dit formulier sloot op ${when(form.closesAt)}.`
          : `This form closed on ${when(form.closesAt)}.`,
      };
    case "FULL":
      return {
        title: nl ? "Volzet" : "Full",
        body: nl
          ? "Alle plaatsen zijn ingenomen."
          : "All spots have been taken.",
      };
    case "WAITLIST":
      return {
        title: nl ? "Volzet, wachtlijst open" : "Full, waiting list open",
        body: nl
          ? "Je kan nog invullen; je komt dan op de wachtlijst."
          : "You can still fill it in; you will be on the waiting list.",
      };
    case "ALREADY_SUBMITTED":
      return {
        title: nl ? "Je diende al in" : "You already submitted",
        body: nl
          ? "We hebben je inzending goed ontvangen."
          : "We have received your entry.",
      };
    case "MEMBERS_ONLY":
      return {
        title: nl ? "Enkel voor leden" : "Members only",
        body: nl
          ? "Log in met je VTK-account om dit formulier in te vullen."
          : "Log in with your VTK account to fill in this form.",
      };
    default:
      return {
        title: nl ? "Niet beschikbaar" : "Not available",
        body: nl ? "Dit formulier staat niet online." : "This form is not online.",
      };
  }
}

export default async function PublicFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale: localeParam, slug }, prefill] = await Promise.all([params, searchParams]);
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";

  const form = await loadPublicForm(slug);
  if (!form) notFound();

  const session = await getCurrentSession();
  // Een beheerder mag een concept bekijken om het na te lezen voor het online
  // gaat; een gewone bezoeker krijgt een 404 zolang het niet gepubliceerd is.
  const canPreview = Boolean(
    session &&
      (session.user.isSuperAdmin ||
        session.permissions.includes("forms.manageAll") ||
        (await prisma.formUserGrant.count({
          where: { formId: form.id, userId: session.user.id },
        })) > 0)
  );
  if (form.status === "DRAFT" && !canPreview) notFound();
  if (form.status === "ARCHIVED") notFound();

  const ownEntries = session
    ? await prisma.formEntry.findMany({
        where: { formId: form.id, submittedById: session.user.id },
        include: { answers: true, uploads: true },
        orderBy: { updatedAt: "desc" },
      })
    : [];
  const submitted = ownEntries.filter((entry) => entry.status === "SUBMITTED");
  const draft = ownEntries.find((entry) => entry.status === "DRAFT") ?? null;

  const availability = formAvailability(form, {
    loggedIn: Boolean(session),
    ownEntries: submitted.length,
    locale,
  });

  const title = pick(form.titleNl, form.titleEn, locale);
  const intro = locale === "en" ? form.introEn ?? form.introNl : form.introNl;
  const closingIn = daysUntilClose(form.closesAt);

  // Een bewerkbare inzending wint van "je diende al in": dan is de bedoeling
  // dat je ze opnieuw ziet staan.
  const editable =
    form.allowEditAfterSubmit && submitted.length > 0 && session ? submitted[0] : null;
  const working = draft ?? editable;

  const blocked =
    availability !== "OPEN" &&
    availability !== "WAITLIST" &&
    !(editable && availability === "ALREADY_SUBMITTED") &&
    !(canPreview && availability === "DRAFT");

  const fields = toPublicFields(form, locale).map((field) => ({
    ...field,
    sectionId: form.fields.find((row) => row.id === field.id)?.sectionId ?? null,
  }));

  // Voorinvullen: eerst wat er al bewaard is, dan het profiel, dan de
  // prefill-parameters uit de link.
  const initialAnswers: Record<string, AnswerValue> = {};
  const initialFiles: Record<string, Array<{ token: string; name: string; sizeBytes: number }>> = {};
  if (working) {
    for (const answer of working.answers) {
      initialAnswers[answer.fieldId] = {
        text: answer.valueText,
        number: answer.valueNumber,
        checked: answer.valueBool,
        options: answer.valueOptions,
      };
    }
  }
  if (session) {
    const profile = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { rNumber: true, studyProgrammes: true, studyYears: true },
    });

    // Enkel invullen wat de beheerder expliciet als profielveld aanduidde, plus
    // het eerste e-mailveld. Raden op basis van de veldnaam ging mis: een vraag
    // met code `naam_van_je_partner` kreeg de naam van de ingelogde bezoeker.
    let emailFilled = false;
    for (const field of form.fields) {
      if (initialAnswers[field.id]) continue;

      if (field.type === "EMAIL" && !emailFilled) {
        initialAnswers[field.id] = { text: session.user.email };
        emailFilled = true;
        continue;
      }
      if (field.type !== "PROFILE") continue;

      const config = parseFieldConfig(field.type, field.config);
      const value =
        config.profileField === "NAME"
          ? session.user.name
          : config.profileField === "EMAIL"
            ? session.user.email
            : config.profileField === "RNUMBER"
              ? profile?.rNumber ?? null
              : config.profileField === "STUDY_PROGRAMME"
                ? profile?.studyProgrammes?.[0] ?? null
                : profile?.studyYears?.[0] ?? null;
      if (value) initialAnswers[field.id] = { text: String(value) };
    }
  }

  // Prefill-links: /formulieren/<slug>?shift=vroeg vult dat veld alvast in, om
  // een half ingevuld formulier gericht te kunnen delen. Bewust niet voor
  // bestanden en toestemming: die moet de bezoeker zelf geven, en een vinkje
  // dat via een link al aanstaat is geen toestemming.
  for (const field of form.fields) {
    if (initialAnswers[field.id]) continue;
    if (field.type === "FILE" || field.type === "CONSENT") continue;
    const raw = prefill[field.code];
    const given = (Array.isArray(raw) ? raw[0] : raw)?.slice(0, 500);
    if (!given) continue;

    if (field.options.length > 0) {
      // Enkel een optie die echt bestaat; anders staat er een keuze aangeduid
      // die de bezoeker niet in de lijst ziet.
      const chosen = given
        .split(",")
        .map((code) => code.trim())
        .filter((code) => field.options.some((option) => option.code === code));
      if (chosen.length > 0) {
        initialAnswers[field.id] = {
          options: field.type === "MULTIPLE_CHOICE" ? chosen : chosen.slice(0, 1),
        };
      }
      continue;
    }
    if (field.type === "NUMBER" || field.type === "SCALE") {
      const number = Number(given);
      if (Number.isFinite(number)) initialAnswers[field.id] = { number };
      continue;
    }
    if (field.type === "BOOLEAN") {
      initialAnswers[field.id] = { checked: given === "1" || given === "true" };
      continue;
    }
    initialAnswers[field.id] = { text: given };
  }

  return (
    <>
      <header className="vtk-page-head">
        <div className="vtk-page-head-inner">
          <p className="vtk-page-kicker">
            <Link href={`${base}/formulieren`}>{nl ? "Formulieren" : "Forms"}</Link>
          </p>
          <h1 className="vtk-page-title">{title}</h1>
          {form.calendarEvent ? (
            <p className="vtk-page-subtitle">
              {pick(form.calendarEvent.titleNl, form.calendarEvent.titleEn, locale)}
            </p>
          ) : null}
        </div>
      </header>

      <main className="vtk-form-page">
        {!offersLocale(form, locale) ? (
          <div className="vtk-form-notice">
            <p>{unavailableMessage(form, locale)}</p>
            <Link href={`${nl ? "/en" : ""}/formulieren/${slug}`}>
              {nl ? "Go to the English version" : "Ga naar de Nederlandse versie"}
            </Link>
          </div>
        ) : (
          <>
            {intro ? (
              <div className="prose-vtk">
                <Markdown>{intro}</Markdown>
              </div>
            ) : null}

            {form.status === "DRAFT" && canPreview ? (
              <div className="vtk-form-notice" data-tone="preview">
                <p>
                  {nl
                    ? "Dit is een voorbeeld: het formulier staat nog niet online en inzendingen tellen mee zodra je het publiceert."
                    : "This is a preview: the form is not online yet."}
                </p>
              </div>
            ) : null}

            {blocked ? (
              <div className="vtk-form-notice" data-tone="blocked">
                <h2>{reasonCopy(availability, locale, form).title}</h2>
                <p>{reasonCopy(availability, locale, form).body}</p>
                {availability === "MEMBERS_ONLY" ? (
                  <Link
                    className="vtk-form-login"
                    href={`${base}/inloggen?next=${encodeURIComponent(`${base}/formulieren/${slug}`)}`}
                  >
                    {nl ? "Inloggen" : "Log in"}
                  </Link>
                ) : null}
              </div>
            ) : (
              <>
                {closingIn !== null && closingIn <= 7 ? (
                  <p className="vtk-form-deadline">
                    {nl
                      ? closingIn === 1
                        ? "Sluit morgen."
                        : `Sluit over ${closingIn} dagen.`
                      : closingIn === 1
                        ? "Closes tomorrow."
                        : `Closes in ${closingIn} days.`}
                  </p>
                ) : null}
                {draft ? (
                  <p className="vtk-form-deadline">
                    {nl
                      ? "Je hebt hier een bewaard concept; het staat hieronder ingevuld."
                      : "You have a saved draft here; it is filled in below."}
                  </p>
                ) : null}

                <PublicForm
                  formId={form.id}
                  slug={form.slug}
                  locale={locale}
                  fields={fields}
                  sections={form.sections}
                  conditions={formConditions(form)}
                  initialAnswers={initialAnswers}
                  initialFiles={initialFiles}
                  entryId={working?.id ?? null}
                  allowDrafts={form.allowDrafts && Boolean(session)}
                  consent={
                    form.requireConsent
                      ? {
                          required: true,
                          text:
                            (locale === "en" ? form.consentTextEn : form.consentTextNl) ??
                            (nl
                              ? "Ik ga akkoord met de verwerking van deze gegevens."
                              : "I agree to the processing of this data."),
                        }
                      : null
                  }
                  privacyUrl={`${base}/privacy`}
                  canTest={canPreview}
                  stepBySections={form.stepBySections}
                  branchOptions={form.fields.flatMap((field) =>
                    field.options.map((option) => ({
                      fieldId: field.id,
                      code: option.code,
                      nextSectionId: option.nextSectionId,
                      endsForm: option.endsForm,
                    }))
                  )}
                  onWaitlist={availability === "WAITLIST"}
                />
              </>
            )}
          </>
        )}
      </main>
    </>
  );
}
