import "server-only";

import { prisma } from "@vtk/db";
import type { Locale } from "@vtk/i18n";
import { brusselsMinutesOfDay, brusselsYMD, ymdKey } from "@/lib/brussels";
import type { EventChoice } from "./eventFill";

/**
 * De evenementen waaruit een evenementveld (`CALENDAR_EVENT`) kiest, en de
 * controle bij het indienen.
 *
 * Zichtbaar is wat gepubliceerd is, plus de concepten van de eigen posten: een
 * post maakt vaak eerst een concept in de kalender en vraagt dan pas
 * communicatie aan. Een concept van een andere post blijft verborgen, net als
 * in de publieke kalender.
 */

const MAX_CHOICES = 200;

const eventSelect = {
  id: true,
  titleNl: true,
  titleEn: true,
  start: true,
  end: true,
  allDay: true,
  location: true,
  publishedAt: true,
  groupId: true,
  group: { select: { slug: true, nameNl: true, nameEn: true } },
} as const;

function hhmm(date: Date): string {
  const minutes = brusselsMinutesOfDay(date);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function dayLabel(date: Date, locale: Locale): string {
  const parts = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "nl-BE", {
    timeZone: "Europe/Brussels",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("weekday").replace(".", "")} ${get("day")} ${get("month").replace(".", "")}`;
}

/**
 * Alle komende evenementen die deze bezoeker mag kiezen, plus `includeIds`
 * (het evenement dat al in een bewaarde inzending staat, ook als het intussen
 * voorbij is). Gesorteerd op begin.
 */
export async function loadEventChoices({
  groupIds,
  locale,
  includeIds = [],
  now = new Date(),
}: {
  groupIds: readonly string[];
  locale: Locale;
  includeIds?: readonly string[];
  now?: Date;
}): Promise<EventChoice[]> {
  const events = await prisma.calendarEvent.findMany({
    where: {
      OR: [
        {
          end: { gte: now },
          OR: [{ publishedAt: { not: null } }, { groupId: { in: [...groupIds] } }],
        },
        ...(includeIds.length > 0 ? [{ id: { in: [...includeIds] } }] : []),
      ],
    },
    select: eventSelect,
    orderBy: { start: "asc" },
    take: MAX_CHOICES,
  });

  const own = new Set(groupIds);
  return events.map((event) => {
    const title = (locale === "en" && event.titleEn) || event.titleNl;
    return {
      id: event.id,
      label: `${dayLabel(event.start, locale)}, ${title}`,
      own: own.has(event.groupId),
      draft: event.publishedAt === null,
      fill: {
        // De titel en de post in het Nederlands: het formulier bewaart wat de
        // organisatoren lezen, niet de taal waarin de bezoeker toevallig zit.
        title: event.titleNl,
        date: ymdKey(brusselsYMD(event.start)),
        startTime: event.allDay ? null : hhmm(event.start),
        endTime: event.allDay ? null : hhmm(event.end),
        location: event.location?.trim() || null,
        groupSlug: event.group.slug,
        groupName: event.group.nameNl,
      },
    };
  });
}

/**
 * Welke van deze event-ids mag de indiener kiezen, met de momentopname die bij
 * het antwoord bewaard wordt ("Cantus (2026-10-21)").
 *
 * Bewust zonder datumgrens: wie een aanvraag na het evenement nog aanvult, mag
 * dat evenement gewoon laten staan. `alreadyChosen` is wat de inzending al
 * had; dat blijft geldig, ook als het evenement intussen weer een concept werd.
 */
export async function resolveEventAnswers({
  groupIds,
  ids,
  alreadyChosen = [],
}: {
  groupIds: readonly string[];
  ids: readonly string[];
  alreadyChosen?: readonly string[];
}): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const kept = new Set(alreadyChosen);
  const events = await prisma.calendarEvent.findMany({
    where: { id: { in: [...ids] } },
    select: eventSelect,
  });

  const allowed = new Map<string, string>();
  for (const event of events) {
    const visible = event.publishedAt !== null || groupIds.includes(event.groupId) || kept.has(event.id);
    if (!visible) continue;
    allowed.set(event.id, `${event.titleNl} (${ymdKey(brusselsYMD(event.start))})`);
  }
  return allowed;
}

/**
 * Hangt de keuzelijst aan de evenementvelden van een lijst velden. Voor de
 * beheerschermen (een inzending aanpassen, iemand toevoegen); het publieke
 * formulier doet hetzelfde in `buildFormSurface`.
 */
export async function attachEventChoices<T extends { type: string }>(
  fields: readonly T[],
  options: { groupIds: readonly string[]; locale: Locale; includeIds?: readonly string[] }
): Promise<Array<T & { events?: EventChoice[] }>> {
  if (!fields.some((field) => field.type === "CALENDAR_EVENT")) return [...fields];
  const events = await loadEventChoices(options);
  return fields.map((field) => (field.type === "CALENDAR_EVENT" ? { ...field, events } : field));
}
