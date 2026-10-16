import "server-only";

import { cache } from "react";
import { prisma } from "@vtk/db";
import type { FormReviewStatus } from "@prisma/client";
import { brusselsMinutesOfDay, brusselsYMD, ymdKey } from "@/lib/brussels";
import { formCapabilitiesByForm, type FormCapability } from "@/lib/forms/authorization";
import { getCurrentSession } from "@/lib/session";

/**
 * De aanvragen bij communicatie: de inzendingen van één gewoon formulier,
 * gelezen als een planning.
 *
 * Welk formulier dat is, staat in de instellingen (`communicatie.requestForm`,
 * gezet door `npm run forms:commu`). De rechten komen van dat formulier: wie de
 * inzendingen mag zien (Communicatie als eigenaar, IT en Groep 5 via
 * `forms.manageAll`, en wie commu er bij "Toegang" bijzet), ziet het overzicht.
 * Een eigen permissie zou een tweede waarheid naast die grants zijn.
 *
 * De veldcodes hieronder komen uit `scripts/create-commu-request-form.ts` en
 * wijzigen nooit (zie `FormField.code`). Verwijdert commu een veld, dan blijft
 * die kolom gewoon leeg.
 */

export const COMMU_REQUEST_SETTING = "communicatie.requestForm";

const CODES = {
  event: "evenement",
  title: "naam",
  date: "datum",
  start: "beginuur",
  end: "einduur",
  post: "post",
  facebook: "facebook",
  facebookText: "facebook_tekst",
  bakske: "bakske",
  bakskeText: "bakske_tekst",
  promo: "promo",
} as const;

/** Korte labels voor in de tabel; de volledige staan in het detail. */
const SHORT_LABELS: Record<string, Record<string, string>> = {
  facebook: {
    nl: "NL",
    nl_engels_welkom: "NL, EN welkom",
    tweetalig: "NL + EN",
    internationaal: "Internationaal",
    nee: "Nee",
  },
  bakske: {
    week_van: "Week zelf",
    week_voordien: "Week ervoor",
    niet: "Niet",
  },
  promo: {
    drukwerk: "Drukwerk",
    fotograaf_commu: "Fotograaf (commu)",
    fotograaf_post: "Fotograaf (post)",
    live_coverage: "Live coverage",
    aftermovie: "Aftermovie",
  },
};

export const COMMU_STATUS_LABELS: Record<FormReviewStatus, [string, string]> = {
  NEW: ["Nieuw", "New"],
  ACCEPTED: ["Ingepland", "Planned"],
  REJECTED: ["Niet opgenomen", "Not included"],
};

export type CommuRequestForm = NonNullable<Awaited<ReturnType<typeof getCommuRequestForm>>>;

/** Het gekoppelde formulier, of null wanneer er (nog) geen is. */
export const getCommuRequestForm = cache(async () => {
  const setting = await prisma.setting.findUnique({ where: { key: COMMU_REQUEST_SETTING } });
  const value = setting?.value as { formId?: unknown } | null | undefined;
  const formId = typeof value?.formId === "string" ? value.formId : null;
  if (!formId) return null;
  return prisma.form.findFirst({
    where: { id: formId, archivedAt: null },
    select: {
      id: true,
      slug: true,
      titleNl: true,
      status: true,
      allowEditAfterSubmit: true,
      fields: {
        where: { archivedAt: null },
        select: {
          id: true,
          code: true,
          options: { select: { code: true, labelNl: true } },
        },
      },
    },
  });
});

/** Wat de huidige gebruiker met de aanvragen mag; leeg zonder formulier. */
export const commuRequestCapabilities = cache(async (): Promise<FormCapability[]> => {
  const form = await getCommuRequestForm();
  if (!form) return [];
  const capabilities = await formCapabilitiesByForm([form.id]);
  return capabilities.get(form.id) ?? [];
});

/** Toont de admin de tab? Elke post (een evenement aanvragen) en wie de aanvragen opvolgt. */
export async function canSeeCommuRequests(): Promise<boolean> {
  const session = await getCurrentSession();
  if (!session) return false;
  if (session.user.isSuperAdmin || session.permissions.includes("calendar.create")) return true;
  return (await commuRequestCapabilities()).includes("VIEW_ENTRIES");
}

/** Het publieke adres van het formulier; het staat enkel in het Nederlands. */
export function commuFormHref(slug: string, params?: Record<string, string>): string {
  const query = params ? `?${new URLSearchParams(params).toString()}` : "";
  return `/formulieren/${slug}${query}`;
}

export type CommuRequestRow = {
  entryId: string;
  submittedById: string | null;
  submitterName: string | null;
  eventId: string | null;
  title: string;
  /** yyyy-mm-dd, uit het evenement wanneer gekoppeld, anders uit het antwoord. */
  date: string | null;
  /** "20:00" of "20:00 - 23:30" */
  time: string | null;
  post: string | null;
  postCode: string | null;
  facebook: string | null;
  bakske: string | null;
  promo: string[];
  /** Het tekstje: binnen, nog niet binnen, of niet nodig (geen Facebook, niet in het Bakske). */
  facebookText: TextState;
  bakskeText: TextState;
  reviewStatus: FormReviewStatus;
};

export type TextState = "DONE" | "MISSING" | null;

type StoredAnswer = {
  fieldCode: string;
  valueText: string | null;
  valueDate: Date | null;
  valueOptions: string[];
};

function hhmm(date: Date): string {
  const minutes = brusselsMinutesOfDay(date);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function timeRange(start: string | null, end: string | null): string | null {
  if (!start) return null;
  return end ? `${start} - ${end}` : start;
}

/** Leest de inzendingen als rijen. Enkel ingediende, geen testinzendingen. */
export async function loadCommuRequests(
  form: CommuRequestForm,
  where: { submittedById?: string; eventIds?: string[] } = {}
): Promise<CommuRequestRow[]> {
  const entries = await prisma.formEntry.findMany({
    where: {
      formId: form.id,
      status: "SUBMITTED",
      isTest: false,
      ...(where.submittedById ? { submittedById: where.submittedById } : {}),
      ...(where.eventIds
        ? { answers: { some: { fieldCode: CODES.event, valueText: { in: where.eventIds } } } }
        : {}),
    },
    select: {
      id: true,
      submittedById: true,
      submitterName: true,
      reviewStatus: true,
      answers: {
        select: { fieldCode: true, valueText: true, valueDate: true, valueOptions: true },
      },
    },
  });

  const eventIds = [
    ...new Set(
      entries.flatMap((entry) =>
        entry.answers
          .filter((answer) => answer.fieldCode === CODES.event && answer.valueText)
          .map((answer) => answer.valueText as string)
      )
    ),
  ];
  const events = eventIds.length
    ? await prisma.calendarEvent.findMany({
        where: { id: { in: eventIds } },
        select: { id: true, titleNl: true, start: true, end: true, allDay: true },
      })
    : [];
  const eventById = new Map(events.map((event) => [event.id, event]));

  const optionLabel = (fieldCode: string, code: string): string => {
    const short = SHORT_LABELS[fieldCode]?.[code];
    if (short) return short;
    const field = form.fields.find((candidate) => candidate.code === fieldCode);
    return field?.options.find((option) => option.code === code)?.labelNl ?? code;
  };

  return entries.map((entry) => {
    const answer = (code: string): StoredAnswer | undefined =>
      entry.answers.find((candidate) => candidate.fieldCode === code);
    const text = (code: string) => answer(code)?.valueText?.trim() || null;
    // Een keuze, of de vrije tekst bij "Andere".
    const choice = (code: string) => {
      const found = answer(code);
      if (!found) return null;
      const chosen = found.valueOptions.map((option) => optionLabel(code, option));
      if (found.valueText?.trim()) chosen.push(found.valueText.trim());
      return chosen.length > 0 ? chosen.join(", ") : null;
    };

    const eventId = text(CODES.event);
    const event = eventId ? eventById.get(eventId) : undefined;
    const answeredDate = answer(CODES.date)?.valueDate;

    // Een tekstje is enkel nodig wanneer er iets gepubliceerd wordt.
    const textState = (choiceCode: string, without: string, textCode: string): TextState => {
      const chosen = answer(choiceCode);
      if (!chosen || (chosen.valueOptions.length === 0 && !chosen.valueText?.trim())) return null;
      if (chosen.valueOptions.includes(without)) return null;
      return text(textCode) ? "DONE" : "MISSING";
    };

    const postAnswer = answer(CODES.post);
    const postCode = postAnswer?.valueOptions[0] ?? (postAnswer?.valueText?.trim() || null);

    return {
      entryId: entry.id,
      submittedById: entry.submittedById,
      submitterName: entry.submitterName,
      eventId: event ? event.id : null,
      title: text(CODES.title) ?? event?.titleNl ?? "",
      // Het evenement is de waarheid over wanneer het doorgaat: wordt het
      // verplaatst, dan schuift de aanvraag mee naar de juiste week.
      date: event
        ? ymdKey(brusselsYMD(event.start))
        : answeredDate
          ? answeredDate.toISOString().slice(0, 10)
          : null,
      time: event
        ? event.allDay
          ? null
          : timeRange(hhmm(event.start), hhmm(event.end))
        : timeRange(text(CODES.start), text(CODES.end)),
      post: choice(CODES.post),
      postCode,
      facebook: choice(CODES.facebook),
      bakske: choice(CODES.bakske),
      promo: [
        ...(answer(CODES.promo)?.valueOptions.map((option) => optionLabel(CODES.promo, option)) ?? []),
        ...(answer(CODES.promo)?.valueText?.trim() ? [answer(CODES.promo)!.valueText!.trim()] : []),
      ],
      facebookText: textState(CODES.facebook, "nee", CODES.facebookText),
      bakskeText: textState(CODES.bakske, "niet", CODES.bakskeText),
      reviewStatus: entry.reviewStatus,
    };
  });
}

/** Sorteert op datum en uur; zonder datum achteraan. */
export function sortByWhen(rows: CommuRequestRow[], direction: "asc" | "desc" = "asc"): CommuRequestRow[] {
  const key = (row: CommuRequestRow) => `${row.date ?? "9999-99-99"} ${row.time ?? ""}`;
  return [...rows].sort((a, b) =>
    direction === "asc" ? key(a).localeCompare(key(b)) : key(b).localeCompare(key(a))
  );
}

/**
 * Komende, gepubliceerde evenementen zonder aanvraag. Voor commu: wie moet er
 * nog iets aanvragen, of wie vergat het?
 */
export async function upcomingEventsWithoutRequest(
  form: CommuRequestForm,
  { days = 21, now = new Date() }: { days?: number; now?: Date } = {}
) {
  const until = new Date(now.getTime() + days * 86_400_000);
  const events = await prisma.calendarEvent.findMany({
    where: { publishedAt: { not: null }, end: { gte: now }, start: { lt: until } },
    select: {
      id: true,
      titleNl: true,
      start: true,
      end: true,
      allDay: true,
      group: { select: { nameNl: true } },
    },
    orderBy: { start: "asc" },
  });
  if (events.length === 0) return [];

  const requested = await prisma.formAnswer.findMany({
    where: {
      formId: form.id,
      fieldCode: CODES.event,
      valueText: { in: events.map((event) => event.id) },
      entry: { status: "SUBMITTED", isTest: false },
    },
    select: { valueText: true },
  });
  const requestedIds = new Set(requested.map((answer) => answer.valueText));

  return events
    .filter((event) => !requestedIds.has(event.id))
    .map((event) => ({
      id: event.id,
      title: event.titleNl,
      date: ymdKey(brusselsYMD(event.start)),
      time: event.allDay ? null : timeRange(hhmm(event.start), hhmm(event.end)),
      post: event.group.nameNl,
    }));
}

/**
 * Per evenement-id: welke aanvraag er al is (de eerste, als er meerdere zijn).
 * Voor het icoon in /admin/kalender en de lijst van een post.
 */
export async function requestsByEvent(
  form: CommuRequestForm,
  eventIds: readonly string[]
): Promise<Map<string, { entryId: string; submittedById: string | null; reviewStatus: FormReviewStatus }>> {
  if (eventIds.length === 0) return new Map();
  const answers = await prisma.formAnswer.findMany({
    where: {
      formId: form.id,
      fieldCode: CODES.event,
      valueText: { in: [...eventIds] },
      entry: { status: "SUBMITTED", isTest: false },
    },
    select: {
      valueText: true,
      entry: { select: { id: true, submittedById: true, reviewStatus: true, submittedAt: true } },
    },
    orderBy: { entry: { submittedAt: "asc" } },
  });
  const result = new Map<
    string,
    { entryId: string; submittedById: string | null; reviewStatus: FormReviewStatus }
  >();
  for (const answer of answers) {
    if (!answer.valueText || result.has(answer.valueText)) continue;
    result.set(answer.valueText, {
      entryId: answer.entry.id,
      submittedById: answer.entry.submittedById,
      reviewStatus: answer.entry.reviewStatus,
    });
  }
  return result;
}
