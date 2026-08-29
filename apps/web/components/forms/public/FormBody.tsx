import Link from "next/link";
import type { Locale } from "@vtk/i18n";
import { Markdown } from "@/components/ui/Markdown";
import { PublicForm } from "@/components/forms/public/PublicForm";
import type { FormAvailability } from "@/lib/forms/publicForm";
import type { FormSurface } from "@/lib/forms/surface";

/**
 * Het formulier zoals de bezoeker het invult: de melding waarom het niet kan, of
 * de velden zelf.
 *
 * Gedeeld door `/formulieren/<slug>` en het paneel in een contentpagina. Alles
 * wat een bezoeker te lezen krijgt over de toestand van een formulier staat dus
 * op een plek; anders zegt de ene weergave "volzet" en de andere niets.
 */

function whenText(date: Date | null, locale: Locale): string {
  if (!date) return "";
  return new Intl.DateTimeFormat(locale === "nl" ? "nl-BE" : "en-BE", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Europe/Brussels",
  }).format(date);
}

export function reasonCopy(
  availability: FormAvailability,
  locale: Locale,
  form: { closesAt: Date | null; opensAt: Date | null }
): { title: string; body: string } {
  const nl = locale === "nl";

  switch (availability) {
    case "NOT_OPEN_YET":
      return {
        title: nl ? "Nog niet open" : "Not open yet",
        body: nl
          ? `Dit formulier opent op ${whenText(form.opensAt, locale)}.`
          : `This form opens on ${whenText(form.opensAt, locale)}.`,
      };
    case "CLOSED":
      return {
        title: nl ? "Gesloten" : "Closed",
        body: nl
          ? `Dit formulier sloot op ${whenText(form.closesAt, locale)}.`
          : `This form closed on ${whenText(form.closesAt, locale)}.`,
      };
    case "FULL":
      return {
        title: nl ? "Volzet" : "Full",
        body: nl ? "Alle plaatsen zijn ingenomen." : "All spots have been taken.",
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
        body: nl ? "We hebben je inzending goed ontvangen." : "We have received your entry.",
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

/**
 * Een korte statusregel: wanneer het sluit en hoeveel plaatsen er nog zijn.
 * Bewust compact en zonder ruis: "nog 97 plaatsen" op een formulier van
 * honderd zegt niets, dus dat toont het pas wanneer het krap wordt.
 */
export function formStatusLine(surface: FormSurface): string | null {
  const { form, locale, availability, closingIn } = surface;
  const nl = locale === "nl";
  const parts: string[] = [];

  if (availability === "NOT_OPEN_YET" && form.opensAt) {
    parts.push(
      nl
        ? `Opent op ${shortDate(form.opensAt, locale)}`
        : `Opens on ${shortDate(form.opensAt, locale)}`
    );
  } else if (availability === "CLOSED" && form.closesAt) {
    parts.push(
      nl
        ? `Gesloten sinds ${shortDate(form.closesAt, locale)}`
        : `Closed since ${shortDate(form.closesAt, locale)}`
    );
  } else if (closingIn !== null && closingIn <= 7) {
    parts.push(
      nl
        ? closingIn === 1
          ? "Sluit morgen"
          : `Sluit over ${closingIn} dagen`
        : closingIn === 1
          ? "Closes tomorrow"
          : `Closes in ${closingIn} days`
    );
  } else if (form.closesAt) {
    parts.push(
      nl
        ? `Sluit op ${shortDate(form.closesAt, locale)}`
        : `Closes on ${shortDate(form.closesAt, locale)}`
    );
  }

  if (availability === "FULL" || availability === "WAITLIST") {
    parts.push(nl ? "volzet" : "full");
  } else if (form.maxEntries !== null) {
    const left = Math.max(0, form.maxEntries - form.submittedCount);
    if (left <= 10) {
      parts.push(
        nl
          ? left === 1
            ? "nog 1 plaats"
            : `nog ${left} plaatsen`
          : left === 1
            ? "1 spot left"
            : `${left} spots left`
      );
    }
  }

  if (form.audience === "MEMBERS") parts.push(nl ? "enkel voor leden" : "members only");

  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * Wat er in de rail bij de formulierknop staat. Bewust korter dan
 * {@link formStatusLine}: daar is plaats voor een regel, hier voor drie woorden,
 * en dan telt enkel het dringendste feit.
 */
export function formRailMeta(surface: FormSurface): string | null {
  const { form, locale, availability, closingIn } = surface;
  const nl = locale === "nl";

  switch (availability) {
    case "CLOSED":
      return nl ? "Gesloten" : "Closed";
    case "FULL":
      return nl ? "Volzet" : "Full";
    case "WAITLIST":
      return nl ? "Volzet, wachtlijst" : "Full, waiting list";
    case "ALREADY_SUBMITTED":
      return nl ? "Je diende al in" : "You already submitted";
    case "MEMBERS_ONLY":
      return nl ? "Enkel voor leden" : "Members only";
    case "DRAFT":
      return nl ? "Nog niet online" : "Not online yet";
    case "NOT_OPEN_YET":
      return form.opensAt
        ? nl
          ? `Opent ${shortDate(form.opensAt, locale)}`
          : `Opens ${shortDate(form.opensAt, locale)}`
        : null;
    default:
      break;
  }

  if (closingIn !== null && closingIn <= 14) {
    return nl
      ? closingIn === 1
        ? "Sluit morgen"
        : `Sluit over ${closingIn} dagen`
      : closingIn === 1
        ? "Closes tomorrow"
        : `Closes in ${closingIn} days`;
  }
  if (form.closesAt) {
    return nl
      ? `Sluit ${shortDate(form.closesAt, locale)}`
      : `Closes ${shortDate(form.closesAt, locale)}`;
  }
  return nl ? "Invullen" : "Fill it in";
}

function shortDate(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "nl" ? "nl-BE" : "en-BE", {
    day: "numeric",
    month: "long",
    timeZone: "Europe/Brussels",
  }).format(date);
}

export function FormBody({
  surface,
  successHref,
  privacyUrl,
  loginHref,
  otherLocaleHref,
  showIntro = true,
  showDeadline = true,
  justSubmitted = null,
}: {
  surface: FormSurface;
  /** Waar de bezoeker terechtkomt na het versturen. */
  successHref: string;
  privacyUrl: string;
  loginHref: string;
  /** De andere taalversie van deze pagina, voor een formulier in een taal. */
  otherLocaleHref: string;
  showIntro?: boolean;
  /**
   * De regel "sluit over N dagen" boven het formulier. Het paneel in een
   * contentpagina zet die uit: daar staat dat al in de statusregel naast de kop,
   * en twee keer dezelfde deadline leest als een fout.
   */
  showDeadline?: boolean;
  /** Net verstuurd op deze pagina; toont de bedanking in plaats van de velden. */
  justSubmitted?: { duplicate: boolean; waitlisted: boolean } | null;
}) {
  const { form, locale, availability, blocked, canPreview } = surface;
  const nl = locale === "nl";
  const intro = locale === "en" ? (form.introEn ?? form.introNl) : form.introNl;

  if (!surface.offersRequestedLocale) {
    return (
      <div className="vtk-form-notice">
        <p>
          {(locale === "en" ? form.unavailableEn : form.unavailableNl) ??
            (locale === "en"
              ? "Sorry, this form is only available in Dutch."
              : "Sorry, dit formulier is enkel in het Engels beschikbaar.")}
        </p>
        <Link href={otherLocaleHref}>
          {nl ? "Go to the English version" : "Ga naar de Nederlandse versie"}
        </Link>
      </div>
    );
  }

  if (justSubmitted) {
    const thanks =
      (locale === "en" ? (form.thankYouEn ?? form.thankYouNl) : form.thankYouNl) ??
      (nl
        ? "Bedankt, we hebben je inzending goed ontvangen."
        : "Thank you, we have received your entry.");
    return (
      <>
        <div className="vtk-form-notice" data-tone="done">
          {justSubmitted.waitlisted ? (
            <p>
              <strong>{nl ? "Je staat op de wachtlijst." : "You are on the waiting list."}</strong>{" "}
              {nl
                ? "Het formulier zat vol op het moment dat je indiende. We nemen contact op zodra er een plaats vrijkomt."
                : "The form was full when you submitted. We will get in touch as soon as a spot frees up."}
            </p>
          ) : null}
          <p>{thanks}</p>
          {form.confirmationEnabled ? (
            <p>
              {nl
                ? "Je krijgt zo een bevestiging per mail."
                : "You will receive a confirmation by e-mail shortly."}
            </p>
          ) : null}
        </div>
        {justSubmitted.duplicate ? (
          <div className="vtk-form-notice" data-tone="warning">
            <p>
              {nl
                ? "Er stond al een inzending met dit e-mailadres. We hebben deze er gewoon bij bewaard; laat het weten als dat niet de bedoeling was."
                : "There was already an entry with this e-mail address. We kept this one as well; let us know if that was not intended."}
            </p>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <>
      {showIntro && intro ? (
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
            <Link className="vtk-form-login" href={loginHref}>
              {nl ? "Inloggen" : "Log in"}
            </Link>
          ) : null}
        </div>
      ) : (
        <>
          {showDeadline && surface.closingIn !== null && surface.closingIn <= 7 ? (
            <p className="vtk-form-deadline">
              {nl
                ? surface.closingIn === 1
                  ? "Sluit morgen."
                  : `Sluit over ${surface.closingIn} dagen.`
                : surface.closingIn === 1
                  ? "Closes tomorrow."
                  : `Closes in ${surface.closingIn} days.`}
            </p>
          ) : null}
          {surface.hasDraft ? (
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
            fields={surface.fields}
            sections={form.sections}
            conditions={surface.conditions}
            initialAnswers={surface.initialAnswers}
            initialFiles={{}}
            entryId={surface.entryId}
            allowDrafts={surface.allowDrafts}
            successHref={successHref}
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
            privacyUrl={privacyUrl}
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
  );
}
