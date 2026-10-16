import "server-only";

import { prisma } from "@vtk/db";
import type { Locale } from "@vtk/i18n";
import { getCurrentSession } from "@/lib/session";
import { parseFieldConfig } from "./schema";
import { loadEventChoices } from "./eventChoices";
import { applyEventFill, type EventChoice } from "./eventFill";
import {
  daysUntilClose,
  formAvailability,
  formConditions,
  offersLocale,
  toPublicFields,
  type FormAvailability,
  type PublicFormData,
} from "./publicForm";
import type { AnswerValue } from "./visibility";

/**
 * Alles wat nodig is om een formulier te tonen: de velden, wat er al ingevuld
 * staat, en of invullen op dit moment kan.
 *
 * Staat hier en niet in de route omdat het formulier op twee plaatsen komt: op
 * zijn eigen pagina (`/formulieren/<slug>`) en als paneel in een contentpagina.
 * Twee kopieen van deze rekensom lopen gegarandeerd uiteen, en dan zegt de ene
 * plek "vol" terwijl de andere gewoon een verzendknop toont.
 */

/** Een veld zoals de renderer het verwacht, met de sectie waarin het staat. */
export type SurfaceField = ReturnType<typeof toPublicFields>[number] & {
  sectionId: string | null;
  /** Enkel bij een evenementveld. */
  events?: EventChoice[];
};

/**
 * Prefill-sleutel die geen veld invult maar een eigen, bestaande inzending
 * opent: `?inzending=<id>`. Gereserveerd, dus een veld met code `inzending`
 * kan je niet via een link invullen.
 */
export const ENTRY_PREFILL_KEY = "inzending";

export type FormSurface = {
  form: PublicFormData;
  locale: Locale;
  availability: FormAvailability;
  /** Kan er nu ingevuld worden, of komt er een uitleg in de plaats? */
  blocked: boolean;
  /** Beheerder die een concept mag nalezen voor het online gaat. */
  canPreview: boolean;
  /** Biedt dit formulier de gevraagde taal aan? */
  offersRequestedLocale: boolean;
  fields: SurfaceField[];
  conditions: ReturnType<typeof formConditions>;
  initialAnswers: Record<string, AnswerValue>;
  entryId: string | null;
  allowDrafts: boolean;
  hasDraft: boolean;
  closingIn: number | null;
};

/**
 * Bouwt het bovenstaande voor een al geladen formulier.
 *
 * `prefill` zijn de queryparameters van de pagina waarop het formulier staat:
 * `?shift=vroeg` vult dat veld alvast in, om een half ingevuld formulier gericht
 * te kunnen delen. `?inzending=<id>` opent een eigen inzending om te bewerken.
 */
export async function buildFormSurface(
  form: PublicFormData,
  locale: Locale,
  prefill: Record<string, string | string[] | undefined> = {}
): Promise<FormSurface> {
  const session = await getCurrentSession();

  // Een beheerder mag een concept bekijken om het na te lezen voor het online
  // gaat; een gewone bezoeker ziet het niet.
  const canPreview = Boolean(
    session &&
      (session.user.isSuperAdmin ||
        session.permissions.includes("forms.manageAll") ||
        (await prisma.formUserGrant.count({
          where: { formId: form.id, userId: session.user.id },
        })) > 0)
  );

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

  // Een gevraagde eigen inzending (`?inzending=<id>`), mits ze nog te bewerken
  // valt: een concept, of een ingediende wanneer bewerken na indienen mag.
  const requestedId = first(prefill[ENTRY_PREFILL_KEY]);
  const requested = requestedId
    ? (ownEntries.find(
        (entry) =>
          entry.id === requestedId &&
          (entry.status === "DRAFT" || form.allowEditAfterSubmit)
      ) ?? null)
    : null;

  // Een bewerkbare inzending wint van "je diende al in": dan is de bedoeling
  // dat je ze opnieuw ziet staan. Mag je meerdere keren indienen, dan is een
  // nieuw bezoek een nieuwe inzending; een oude open je via `?inzending=`.
  const editable =
    form.allowEditAfterSubmit && !form.allowMultipleSubmissions && submitted.length > 0 && session
      ? submitted[0]
      : null;
  const working = requested ?? draft ?? editable;
  const editingSubmitted = working?.status === "SUBMITTED";

  const blocked =
    availability !== "OPEN" &&
    availability !== "WAITLIST" &&
    !(editingSubmitted && availability === "ALREADY_SUBMITTED") &&
    !(canPreview && availability === "DRAFT");

  // De evenementen voor een evenementveld, plus het evenement dat al in de
  // bewaarde inzending staat (ook als het intussen voorbij is).
  const eventFieldIds = new Set(
    form.fields.filter((field) => field.type === "CALENDAR_EVENT").map((field) => field.id)
  );
  const events =
    eventFieldIds.size > 0
      ? await loadEventChoices({
          groupIds: session?.groups.map((group) => group.id) ?? [],
          locale,
          includeIds: (working?.answers ?? [])
            .filter((answer) => eventFieldIds.has(answer.fieldId) && answer.valueText)
            .map((answer) => answer.valueText as string),
        })
      : [];

  const fields = toPublicFields(form, locale).map((field) => ({
    ...field,
    sectionId: form.fields.find((row) => row.id === field.id)?.sectionId ?? null,
    ...(eventFieldIds.has(field.id) ? { events } : {}),
  }));

  // Voorinvullen: eerst wat er al bewaard is, dan het profiel, dan de
  // prefill-parameters uit de link.
  const initialAnswers: Record<string, AnswerValue> = {};
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
              ? (profile?.rNumber ?? null)
              : config.profileField === "STUDY_PROGRAMME"
                ? (profile?.studyProgrammes?.[0] ?? null)
                : (profile?.studyYears?.[0] ?? null);
      if (value) initialAnswers[field.id] = { text: String(value) };
    }
  }

  // Prefill-links. Bewust niet voor bestanden en toestemming: die moet de
  // bezoeker zelf geven, en een vinkje dat via een link al aanstaat is geen
  // toestemming.
  const prefilledEvents: string[] = [];
  for (const field of form.fields) {
    if (initialAnswers[field.id]) continue;
    if (field.type === "FILE" || field.type === "CONSENT") continue;
    if (field.code === ENTRY_PREFILL_KEY) continue;
    if (field.type === "CALENDAR_EVENT") {
      // Enkel een evenement dat ook in de keuzelijst staat; de rest van het
      // formulier volgt het hieronder.
      const id = first(prefill[field.code]);
      if (id && events.some((event) => event.id === id)) {
        initialAnswers[field.id] = { text: id };
        prefilledEvents.push(field.id);
      }
      continue;
    }
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

  // Een evenement uit de link vult de velden in die het hoort in te vullen, net
  // zoals een keuze in de lijst dat doet. Wat al uit de link of het profiel kwam,
  // blijft staan: applyEventFill overschrijft enkel lege velden.
  let filled = initialAnswers;
  for (const fieldId of prefilledEvents) {
    const eventField = fields.find((field) => field.id === fieldId);
    const chosen = events.find((event) => event.id === filled[fieldId]?.text) ?? null;
    if (eventField) filled = applyEventFill(filled, fields, eventField, chosen, null);
  }

  return {
    form,
    locale,
    availability,
    blocked,
    canPreview,
    offersRequestedLocale: offersLocale(form, locale),
    fields,
    conditions: formConditions(form),
    initialAnswers: filled,
    entryId: working?.id ?? null,
    allowDrafts: form.allowDrafts && Boolean(session),
    hasDraft: Boolean(draft),
    closingIn: daysUntilClose(form.closesAt),
  };
}

function first(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim().slice(0, 100) || null;
}
