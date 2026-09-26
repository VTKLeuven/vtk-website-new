"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@vtk/db";
import { hasPermission } from "@vtk/auth";
import { deleteObject } from "@vtk/storage";
import { requireSession } from "@/lib/session";
import { readImageField, resolveImageKey } from "@/lib/imageField";
import { readImageFocus } from "@/lib/imageFocus";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import { describeChanges, logAudit } from "@/lib/audit";
import { localDateTimeToUtc } from "@/lib/ticketing/time";
import {
  categorySlugTaken,
  eventSlugBase,
  eventSlugTaken,
  SLUG_PATTERN,
  uniqueEventSlug,
} from "@/lib/calendar/slug";
import { EVENT_LINK_LABEL_MAX } from "@/lib/calendar/eventLink";

const eventSchema = z.object({
  id: z.string().optional(),
  // Leeg = afleiden uit de titel. Wie hem wel intikt, krijgt dezelfde regels als
  // een categorieslug: dit staat in een publieke URL.
  slug: z.string().trim().max(80).regex(SLUG_PATTERN).optional(),
  titleNl: z.string().min(1),
  titleEn: z.string().optional().nullable(),
  descriptionNl: z.string().optional().nullable(),
  descriptionEn: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  groupId: z.string().min(1),
  // De organisator zoals bezoekers hem zien, wanneer dat niet de beherende groep
  // is. Leeg = de groep; zie lib/calendar/organiser.ts.
  organiserName: z.string().trim().max(120).optional().nullable(),
  // Leeg wanneer het evenement met losse momenten werkt: dan komen start en
  // einde uit die momenten. Zie `readMoments` hieronder.
  start: z.string().optional(),
  end: z.string().optional(),
  allDay: z.coerce.boolean().default(false),
  url: z.string().optional().nullable(),
  // De tekst op de knop naar die link. Kort gehouden: het is een knop naast twee
  // andere, geen zin. Leeg = de standaardtekst; zie lib/calendar/eventLink.ts.
  urlLabelNl: z.string().trim().max(EVENT_LINK_LABEL_MAX).optional().nullable(),
  urlLabelEn: z.string().trim().max(EVENT_LINK_LABEL_MAX).optional().nullable(),
  heroWeek: z.enum(["AUTO", "PINNED", "HIDDEN"]).default("AUTO"),
});

/** Eén moment zoals het formulier het meestuurt: een dag en twee uren. */
const momentSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
  label: z.string().trim().max(80).optional().default(""),
});

/**
 * Hoeveel momenten één evenement mag dragen. Een loopweek heeft er zeven en een
 * kerstmarkt een stuk of tien; honderd is geen evenement meer maar een reeks die
 * in de kalender zelf thuishoort.
 */
const MAX_MOMENTS = 60;

/**
 * De losse momenten uit het formulier, in volgorde.
 *
 * `null` = het formulier stuurde er geen mee, dus het evenement werkt met één
 * doorlopende periode. Een lege lijst is wél een fout: dan stond het formulier in
 * de momentenmodus zonder dat er iets ingevuld was, en stil terugvallen op de
 * start en het einde van daarnet zou iets anders opslaan dan wat er op het scherm
 * stond.
 *
 * Een einduur dat niet later is dan het beginuur betekent de nacht erna: een
 * nachtloop van 22u tot 2u hoort bij de avond waarop hij vertrekt, en dat is ook
 * hoe de kalender hem indeelt.
 */
function readMoments(
  formData: FormData,
): { start: Date; end: Date; label: string | null }[] | null | "invalid" {
  const raw = formData.get("moments");
  if (typeof raw !== "string") return null;

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return "invalid";
  }
  const parsed = z.array(momentSchema).max(MAX_MOMENTS).safeParse(parsedJson);
  if (!parsed.success) return "invalid";

  const moments: { start: Date; end: Date; label: string | null }[] = [];
  for (const row of parsed.data) {
    try {
      const start = localDateTimeToUtc(`${row.date}T${row.start}`);
      const endDay = row.end > row.start ? row.date : nextDay(row.date);
      moments.push({
        start,
        end: localDateTimeToUtc(`${endDay}T${row.end}`),
        label: row.label || null,
      });
    } catch {
      return "invalid";
    }
  }
  return moments.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** De dag na deze, als "YYYY-MM-DD". Kalenderdagen, dus via UTC gerekend. */
function nextDay(date: string): string {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

/** Velden die in het logboek bij naam genoemd worden bij een bewerking. */
const EVENT_FIELD_LABELS: Record<string, string> = {
  slug: "URL-naam",
  titleNl: "titel",
  titleEn: "Engelse titel",
  descriptionNl: "beschrijving",
  descriptionEn: "Engelse beschrijving",
  location: "locatie",
  groupId: "groep",
  organiserName: "organisator",
  start: "startmoment",
  end: "eindmoment",
  allDay: "hele dag",
  url: "link",
  urlLabelNl: "knoptekst van de link",
  urlLabelEn: "Engelse knoptekst van de link",
  registrationNewsAt: "inschrijvingen in het nieuws",
  imageKey: "afbeelding",
  imageFocusX: "uitsnede van de afbeelding",
  imageFocusY: "uitsnede van de afbeelding",
  publishedAt: "publicatiestatus",
  heroWeek: "weekoverzicht op de homepage",
  moments: "momenten",
};

async function assertCanManageEvent(userGroups: string[], groupId: string, superOrAll: boolean) {
  if (superOrAll) return;
  if (!userGroups.includes(groupId)) {
    throw new Error("forbidden");
  }
}

export async function saveEventAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const session = await requireSession();
  const parsed = eventSchema.safeParse({
    id: (formData.get("id") as string) || undefined,
    slug: (formData.get("slug") as string)?.trim() || undefined,
    titleNl: formData.get("titleNl"),
    titleEn: formData.get("titleEn") || null,
    descriptionNl: formData.get("descriptionNl") || null,
    descriptionEn: formData.get("descriptionEn") || null,
    location: formData.get("location") || null,
    groupId: formData.get("groupId"),
    organiserName: formData.get("organiserName") || null,
    // Afwezig in de momentenmodus; `undefined` en niet `null`, want het veld is
    // optioneel en niet leeg.
    start: formData.get("start") ?? undefined,
    end: formData.get("end") ?? undefined,
    allDay: formData.get("allDay") === "on",
    url: formData.get("url") || null,
    urlLabelNl: formData.get("urlLabelNl") || null,
    urlLabelEn: formData.get("urlLabelEn") || null,
    heroWeek: formData.get("heroWeek") || "AUTO",
  });
  const image = readImageField(formData);
  // Waar de uitsnede rond draait. Geen validatiepad: het veld stuurt altijd een
  // punt mee en alles wat geen bruikbaar getal is, wordt het midden.
  const focus = readImageFocus(formData);
  if (!parsed.success || image.kind === "invalid") return saveError("INVALID_INPUT");
  const input = parsed.data;
  const categoryIds = formData.getAll("categoryIds").map(String).filter(Boolean);
  const saveAsDraft = formData.get("publication") === "draft";
  // "Deze link opent de inschrijvingen": zonder link valt er niets te openen.
  const registrationNews = formData.get("registrationNews") === "on" && Boolean(input.url);
  // E1: hangt er een logistiek-evenement aan dit evenement?
  const needsLogistics = formData.get("needsLogistics") === "on";

  const moments = readMoments(formData);
  if (moments === "invalid") return saveError("INVALID_MOMENT");
  if (moments !== null && moments.length === 0) return saveError("NO_MOMENTS");

  // De envelop rond de momenten: de start van het eerste en het einde van het
  // laatste. `CalendarEvent.start`/`.end` blijven daarmee kloppen voor alles wat
  // niets van momenten weet (zoek, tickets, logistiek, de vensters van de feeds).
  let start: Date;
  let end: Date;
  if (moments) {
    start = moments[0]!.start;
    end = moments.reduce((latest, moment) => (moment.end > latest ? moment.end : latest), moments[0]!.end);
  } else {
    if (!input.start || !input.end) return saveError("INVALID_INPUT");
    try {
      start = localDateTimeToUtc(input.start);
      end = localDateTimeToUtc(input.end);
    } catch {
      return saveError("INVALID_INPUT");
    }
  }
  // Het einde mag niet voor de start liggen. Anders is het evenement tegelijk
  // "aankomend" op de homepage (die op `start` filtert) en "verleden" in de
  // admin (die op `end` filtert): dezelfde datum, twee tegengestelde statussen.
  //
  // Even lang als niets telt daarbij mee, maar enkel wanneer er uren aan
  // hangen: `DTEND` van een hele-dag-event is exclusief, dus daar ís start
  // gelijk aan eind precies één dag. Een tijdstip-evenement van nul minuten is
  // altijd een typfout, en in een agenda-app is het een streepje zonder hoogte
  // dat je niet ziet staan. Er stond er zo een in de feed.
  const zeroLength = !input.allDay && !moments && end.getTime() === start.getTime();
  if (end < start || zeroLength) return saveError("END_BEFORE_START");

  const superOrAll =
    session.user.isSuperAdmin || hasPermission(session, "calendar.manageAll");
  if (!superOrAll && !hasPermission(session, "calendar.create")) {
    throw new Error("forbidden");
  }
  // Het weekoverzicht op de homepage is een eigen permissie: wie ze niet heeft,
  // ziet het veld niet staan en kan het ook niet meesturen. Bij een bestaand
  // evenement blijft dan gewoon staan wat er stond, in plaats van stil terug te
  // vallen op "automatisch".
  const canHeroWeek = session.user.isSuperAdmin || hasPermission(session, "calendar.heroWeek");
  const userGroupIds = session.groups.map((g) => g.id);
  await assertCanManageEvent(userGroupIds, input.groupId, superOrAll);

  const data = {
    titleNl: input.titleNl,
    titleEn: input.titleEn,
    descriptionNl: input.descriptionNl,
    descriptionEn: input.descriptionEn,
    location: input.location,
    groupId: input.groupId,
    // Een naam van enkel spaties is hetzelfde als niets ingevuld: dan blijft de
    // groep de organisator, in plaats van dat de site een lege naam toont.
    organiserName: input.organiserName || null,
    start,
    end,
    // Een reeks momenten en een heledagevenement sluiten elkaar uit: iets dat een
    // hele dag duurt, heeft geen uren om per dag te herhalen.
    allDay: moments ? false : input.allDay,
    url: input.url,
    // Enkel spaties is hetzelfde als niets: dan staat de standaardtekst op de
    // knop in plaats van een lege knop.
    urlLabelNl: input.urlLabelNl || null,
    urlLabelEn: input.urlLabelEn || null,
    imageFocusX: focus.x,
    imageFocusY: focus.y,
    createdById: session.user.id,
    ...(canHeroWeek ? { heroWeek: input.heroWeek } : {}),
  };

  // De categorieën komen als losse checkbox-waarden binnen; alles wegdoen en
  // opnieuw zetten houdt de koppeltabel gelijk aan wat het formulier toont, ook
  // wanneer iemand een vinkje uitzet.
  const setCategories = {
    deleteMany: {},
    create: categoryIds.map((categoryId) => ({ categoryId })),
  };

  // Dezelfde aanpak als bij de categorieën: alles wegdoen en opnieuw zetten houdt
  // de rijen gelijk aan wat het formulier toont. De UID in de agenda-feed hangt
  // daarom aan de dag en niet aan de id van de rij; zie lib/calendar/feeds.ts.
  const setMoments = moments
    ? { deleteMany: {}, create: moments }
    : { deleteMany: {} };

  let created: { id: string } | null = null;

  if (input.id) {
    const existing = await prisma.calendarEvent.findUnique({ where: { id: input.id } });
    if (!existing) return saveError("INVALID_INPUT");
    await assertCanManageEvent(userGroupIds, existing.groupId, superOrAll);
    const imageKey = resolveImageKey(image, existing.imageKey);
    // De URL-naam volgt de titel **niet** vanzelf bij een bewerking: elke
    // correctie aan de titel zou dan elke gedeelde link breken. Het formulier
    // toont de huidige slug, dus komt hij hier gewoon weer binnen; leeg betekent
    // "laat staan".
    const slug = input.slug ?? existing.slug;
    if (slug !== existing.slug && (await eventSlugTaken(slug, input.id))) {
      return saveError("SLUG_TAKEN");
    }
    // De gewone knop publiceert een bestaand concept en bewaart de status van
    // een al gepubliceerd evenement. Alleen de expliciete conceptknop haalt het
    // evenement offline.
    const publishedAt = saveAsDraft ? null : (existing.publishedAt ?? new Date());
    // Het moment van aanduiden blijft staan zolang het vinkje aan blijft: anders
    // zou elke kleine correctie het evenement opnieuw als vers nieuws tonen.
    const registrationNewsAt = registrationNews ? (existing.registrationNewsAt ?? new Date()) : null;
    await prisma.calendarEvent.update({
      where: { id: input.id },
      data: {
        ...data,
        slug,
        imageKey,
        publishedAt,
        registrationNewsAt,
        categories: setCategories,
        moments: setMoments,
      },
    });
    // Een gekoppeld ticketevent erft deze velden. Zonder deze duw blijft de
    // ticketshop de oude datum of locatie tonen tot iemand daar toevallig ook
    // eens opslaat; dat verschil merkt niemand tot een koper op het verkeerde
    // uur voor de deur staat.
    await prisma.ticketEvent.updateMany({
      where: { calendarEventId: input.id },
      data: {
        titleNl: input.titleNl,
        titleEn: input.titleEn,
        descriptionNl: input.descriptionNl,
        descriptionEn: input.descriptionEn,
        location: input.location,
        startsAt: start,
        endsAt: end,
      },
    });
    // Hetzelfde duwtje als bij het ticketevent hierboven, om dezelfde reden: het
    // logistiek-evenement draagt een kopie van naam, locatie en uren, en zonder
    // deze update blijft daar de oude datum staan tot iemand er toevallig ook
    // eens opslaat (E1).
    await syncUitleenEvent(input.id, {
      needsLogistics,
      name: input.titleNl,
      location: input.location ?? null,
      start,
      end,
      groupId: input.groupId,
      createdById: session.user.id,
    });
    await logAudit({
      action: "update",
      entity: "calendarEvent",
      entityId: input.id,
      target: input.titleNl,
      summary: describeChanges(
        existing,
        { ...data, slug, imageKey, publishedAt, registrationNewsAt },
        EVENT_FIELD_LABELS,
      ),
    });
    // De vervangen (of gewiste) afbeelding opruimen, zodat losse objecten niet
    // in de bucket blijven staan. Mislukt dat, dan is dat geen opslaanfout.
    if (existing.imageKey && existing.imageKey !== imageKey) {
      try {
        await deleteObject(existing.imageKey);
      } catch {
        /* ignore */
      }
    }
  } else {
    // Niets ingetikt betekent "leid af uit de titel"; dan mag de teller stil
    // bijspringen bij een tweede editie in hetzelfde jaar. Wel zelf ingetikt en
    // al bezet is een gewone invoerfout, en hoort als rode toast terug te komen.
    let slug: string;
    if (input.slug) {
      if (await eventSlugTaken(input.slug)) return saveError("SLUG_TAKEN");
      slug = input.slug;
    } else {
      slug = await uniqueEventSlug(eventSlugBase(input.titleNl, start));
    }
    created = await prisma.calendarEvent.create({
      data: {
        ...data,
        slug,
        imageKey: resolveImageKey(image, null),
        publishedAt: saveAsDraft ? null : new Date(),
        registrationNewsAt: registrationNews ? new Date() : null,
        categories: { create: categoryIds.map((categoryId) => ({ categoryId })) },
        ...(moments ? { moments: { create: moments } } : {}),
      },
      select: { id: true },
    });
    await syncUitleenEvent(created.id, {
      needsLogistics,
      name: input.titleNl,
      location: input.location ?? null,
      start,
      end,
      groupId: input.groupId,
      createdById: session.user.id,
    });
    await logAudit({
      action: "create",
      entity: "calendarEvent",
      entityId: created.id,
      target: input.titleNl,
    });
  }
  revalidatePath("/kalender");
  revalidatePath("/admin/kalender");
  // De categoriepagina's tonen dezelfde events; zonder dit blijft /kalender/<slug>
  // de oude lijst tonen tot de cache vanzelf verloopt.
  revalidatePath("/kalender/[slugOrId]", "page");
  revalidatePath("/tickets");

  // De redirect is zelf de bevestiging; loopt via een throw en hoort dus buiten
  // elke try/catch te blijven.
  //
  // "Opslaan en tickets toevoegen" brengt je meteen naar het ticketformulier met
  // dit evenement al gekoppeld, zodat je de titel, datums en locatie niet een
  // tweede keer hoeft in te tikken.
  if (created && formData.get("andThen") === "tickets") {
    redirect(`/admin/tickets/new?calendarEvent=${created.id}`);
  }
  redirect("/admin/kalender");
}

/**
 * Het logistiek-evenement dat bij dit kalenderevenement hoort (E1).
 *
 * `docs/design-decisions.md` zegt dat een logistiek-evenement niet vanzelf
 * ontstaat: anders krijgt elke uitlening van twee tafels er een en wordt het
 * evenementscherm een tweede aanvraaglijst. Een aangevinkt **kalender**evenement
 * is de uitzondering: dat is geen aanvraag maar een gecureerde activiteit van de
 * kring, en het vinkje houdt de beslissing bij een mens.
 *
 * Drie regels:
 *
 * - **Aanvinken maakt er een**, met naam, locatie en uren van hier.
 * - **Bestaat er al een, dan volgt die mee.** Precies zoals de `ticketEvent`-duw
 *   hierboven: zonder dit blijft daar de oude datum staan tot iemand er
 *   toevallig ook eens opslaat, en dat verschil merkt niemand tot het materiaal
 *   op de verkeerde dag klaarstaat.
 * - **Uitvinken koppelt niets los.** Er kunnen al aanvragen aan hangen, en die
 *   losmaken zou werk weggooien dat hier niet zichtbaar is. Het formulier zegt
 *   dat erbij.
 *
 * Faalt dit, dan faalt het opslaan van het evenement niet: het kalenderevenement
 * is het echte werk en de koppeling is een gemak.
 */
async function syncUitleenEvent(
  calendarEventId: string,
  input: {
    needsLogistics: boolean;
    name: string;
    location: string | null;
    start: Date;
    end: Date;
    groupId: string;
    createdById: string;
  },
): Promise<void> {
  try {
    const existing = await prisma.uitleenEvent.findUnique({
      where: { calendarEventId },
      select: { id: true },
    });

    if (existing) {
      await prisma.uitleenEvent.update({
        where: { id: existing.id },
        data: {
          name: input.name.slice(0, 200),
          location: input.location?.slice(0, 300) || null,
          startAt: input.start,
          startTimeKnown: true,
          endAt: input.end,
        },
      });
      return;
    }
    if (!input.needsLogistics) return;

    await prisma.uitleenEvent.create({
      data: {
        calendarEventId,
        name: input.name.slice(0, 200),
        location: input.location?.slice(0, 300) || null,
        startAt: input.start,
        startTimeKnown: true,
        endAt: input.end,
        groupId: input.groupId,
        createdById: input.createdById,
      },
    });
  } catch (err) {
    console.error("[calendar] logistiek-evenement synchroniseren mislukt:", err);
  }
}

const categorySchema = z.object({
  id: z.string().optional(),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(60)
    // De slug zit in de publieke URL en in de feed-URL, dus enkel kleine letters,
    // cijfers en koppeltekens; verder niets dat een URL nodig heeft te escapen.
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  nameNl: z.string().trim().min(1).max(60),
  nameEn: z.string().trim().min(1).max(60),
  descriptionNl: z.string().optional().nullable(),
  descriptionEn: z.string().optional().nullable(),
  colour: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/),
  showOnCalendarPage: z.coerce.boolean().default(false),
  // Bij elke doelgroepwaarde hoort code die bepaalt wie erbij hoort
  // (lib/calendar/audience.ts), dus dit is een gesloten lijst.
  kind: z.enum(["category", "audience"]),
  audience: z
    .enum(["FIRST_YEARS", "INTERNATIONALS", "LAST_YEARS", "ALUMNI"])
    .nullable()
    .default(null),
});

const CATEGORY_FIELD_LABELS: Record<string, string> = {
  slug: "slug",
  nameNl: "naam",
  nameEn: "Engelse naam",
  descriptionNl: "beschrijving",
  descriptionEn: "Engelse beschrijving",
  colour: "kleur",
  showOnCalendarPage: "tonen op de kalenderpagina",
  audience: "doelgroep",
  imageKey: "standaardbanner",
};

function revalidateCalendar() {
  revalidatePath("/kalender");
  revalidatePath("/en/kalender");
  revalidatePath("/kalender/[slugOrId]", "page");
  revalidatePath("/admin/kalender/categorieen");
  revalidatePath("/en/admin/kalender/categorieen");
}

/**
 * Maakt of bewerkt een kalendercategorie. De slug wijzigen breekt bestaande
 * abonnementen en gedeelde links, dus dat is een bewuste beheerdersactie, geen
 * bijwerking van een naamswijziging.
 */
export async function saveCalendarCategoryAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const session = await requireSession();
  if (!session.user.isSuperAdmin && !hasPermission(session, "calendar.manageAll")) {
    throw new Error("forbidden");
  }

  const parsed = categorySchema.safeParse({
    id: (formData.get("id") as string) || undefined,
    slug: formData.get("slug"),
    nameNl: formData.get("nameNl"),
    nameEn: formData.get("nameEn"),
    descriptionNl: formData.get("descriptionNl") || null,
    descriptionEn: formData.get("descriptionEn") || null,
    colour: formData.get("colour"),
    showOnCalendarPage: formData.get("showOnCalendarPage") === "on",
    kind: formData.get("kind"),
    audience: formData.get("audience") || null,
  });
  if (!parsed.success) return saveError("INVALID_INPUT");
  const image = readImageField(formData);
  if (image.kind === "invalid") return saveError("INVALID_INPUT");
  const { id, kind, ...parsedData } = parsed.data;
  if (kind === "audience" && !parsedData.audience) return saveError("INVALID_INPUT");
  const existing = id ? await prisma.calendarCategory.findUnique({ where: { id } }) : null;
  const data = {
    ...parsedData,
    audience: kind === "category" ? null : parsedData.audience,
    showOnCalendarPage: kind === "category" ? parsedData.showOnCalendarPage : false,
    // De standaardbanner hoort bij een thema; een doelgroep zegt voor wie het
    // evenement is, niet hoe het eruitziet. Zie docs/design-decisions.md.
    imageKey: kind === "category" ? resolveImageKey(image, existing?.imageKey ?? null) : null,
  };

  // Een dubbele slug is gewone invoerfout, geen serverfout: hij hoort als rode
  // toast terug te komen in plaats van in de error boundary te belanden. De
  // controle kijkt ook naar de evenementen, want die delen sinds de URL-namen
  // hetzelfde routesegment: een categorie "galabal-2026" zou het evenement met
  // die naam onbereikbaar maken.
  if (await categorySlugTaken(data.slug, id)) return saveError("SLUG_TAKEN");

  if (id) {
    await prisma.calendarCategory.update({ where: { id }, data });
    // De vervangen of gewiste foto hoeft niet in de opslag te blijven staan.
    if (existing?.imageKey && existing.imageKey !== data.imageKey) {
      try {
        await deleteObject(existing.imageKey);
      } catch {
        /* De databasewijziging blijft geldig als storage-opruiming faalt. */
      }
    }
    await logAudit({
      action: "update",
      entity: "calendarCategory",
      entityId: id,
      target: data.nameNl,
      summary: existing ? describeChanges(existing, data, CATEGORY_FIELD_LABELS) : null,
    });
  } else {
    const last = await prisma.calendarCategory.findFirst({
      orderBy: { order: "desc" },
      select: { order: true },
    });
    const category = await prisma.calendarCategory.create({
      data: { ...data, order: (last?.order ?? -1) + 1 },
    });
    await logAudit({
      action: "create",
      entity: "calendarCategory",
      entityId: category.id,
      target: data.nameNl,
    });
  }

  revalidateCalendar();
  return saveOk();
}

export async function reorderCalendarCategoriesAction(ids: string[]): Promise<void> {
  const session = await requireSession();
  if (!session.user.isSuperAdmin && !hasPermission(session, "calendar.manageAll")) {
    throw new Error("forbidden");
  }

  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.calendarCategory.update({
        where: { id },
        data: { order: index },
      })
    )
  );
  await logAudit({
    action: "reorder",
    entity: "calendarCategory",
    target: `${ids.length} kalendercategorieën`,
    summary: "volgorde van kalendercategorieën gewijzigd",
  });
  revalidateCalendar();
}

/**
 * Verwijdert een categorie. De events zelf blijven bestaan; enkel de koppeling
 * verdwijnt (cascade op de koppeltabel), dus de pagina en de feed van die
 * categorie houden op te bestaan maar er gaat geen enkel evenement verloren.
 */
export async function deleteCalendarCategoryAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!session.user.isSuperAdmin && !hasPermission(session, "calendar.manageAll")) {
    throw new Error("forbidden");
  }
  const id = formData.get("id") as string;
  if (!id) return;

  const category = await prisma.calendarCategory.delete({ where: { id } });
  if (category.imageKey) {
    try {
      await deleteObject(category.imageKey);
    } catch {
      /* De categorie is weg; een achtergebleven bestand is geen reden om te falen. */
    }
  }
  await logAudit({
    action: "delete",
    entity: "calendarCategory",
    entityId: id,
    target: category.nameNl,
    summary: "de evenementen zelf blijven bestaan",
  });
  revalidateCalendar();
}

/**
 * Het weekoverzicht op de homepage aan- of uitzetten vanuit de evenementenlijst.
 *
 * Dezelfde keuze als het veld in het formulier (`heroWeek`), maar op de plaats
 * waar ze in de praktijk gemaakt wordt: je ziet pas dat een dag te vol staat
 * wanneer je de week naast elkaar ziet, en dan is een evenement openen, een
 * keuzelijst zoeken en opslaan drie stappen te veel.
 *
 * Aparte permissie, net als in het formulier: wie ze niet heeft, krijgt de
 * knoppen niet te zien en kan ze ook niet omzeilen door zelf te posten.
 */
export async function setEventHeroWeekAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const session = await requireSession();
  const id = (formData.get("id") as string) || "";
  const parsed = z.enum(["AUTO", "PINNED", "HIDDEN"]).safeParse(formData.get("heroWeek"));
  if (!id || !parsed.success) return saveError("INVALID_INPUT");

  const superOrAll =
    session.user.isSuperAdmin || hasPermission(session, "calendar.manageAll");
  if (!session.user.isSuperAdmin && !hasPermission(session, "calendar.heroWeek")) {
    throw new Error("forbidden");
  }
  const evt = await prisma.calendarEvent.findUnique({ where: { id } });
  if (!evt) return saveError("NOT_FOUND");
  await assertCanManageEvent(
    session.groups.map((g) => g.id),
    evt.groupId,
    superOrAll,
  );
  if (evt.heroWeek === parsed.data) return saveOk();

  await prisma.calendarEvent.update({ where: { id }, data: { heroWeek: parsed.data } });
  await logAudit({
    action: "update",
    entity: "calendarEvent",
    entityId: id,
    target: evt.titleNl,
    summary: `weekoverzicht op de homepage: ${parsed.data.toLowerCase()}`,
  });
  // De homepage leest dit veld, en de lijst hiernaast toont de nieuwe stand.
  revalidateCalendar();
  revalidatePath("/admin/kalender");
  return saveOk();
}

export async function deleteEventAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const id = formData.get("id") as string;
  if (!id) return;
  const evt = await prisma.calendarEvent.findUnique({ where: { id } });
  if (!evt) return;
  const superOrAll =
    session.user.isSuperAdmin || hasPermission(session, "calendar.manageAll");
  if (!superOrAll && !hasPermission(session, "calendar.create")) {
    throw new Error("forbidden");
  }
  const userGroupIds = session.groups.map((g) => g.id);
  await assertCanManageEvent(userGroupIds, evt.groupId, superOrAll);
  await prisma.calendarEvent.delete({ where: { id } });
  await logAudit({
    action: "delete",
    entity: "calendarEvent",
    entityId: id,
    target: evt.titleNl,
  });
  if (evt.imageKey) {
    try {
      await deleteObject(evt.imageKey);
    } catch {
      /* ignore */
    }
  }
  revalidatePath("/kalender");
  // Geen redirect: de lijst ververst ter plaatse, zodat de gekozen filter
  // (aankomend/verleden) blijft staan.
  revalidatePath("/admin/kalender");
}
