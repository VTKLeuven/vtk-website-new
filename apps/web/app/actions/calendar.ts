"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@vtk/db";
import { hasPermission } from "@vtk/auth";
import { deleteObject } from "@vtk/storage";
import { requireSession } from "@/lib/session";
import { readImageField, resolveImageKey } from "@/lib/imageField";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import { describeChanges, logAudit } from "@/lib/audit";
import { localDateTimeToUtc } from "@/lib/ticketing/time";

const eventSchema = z.object({
  id: z.string().optional(),
  titleNl: z.string().min(1),
  titleEn: z.string().optional().nullable(),
  descriptionNl: z.string().optional().nullable(),
  descriptionEn: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  groupId: z.string().min(1),
  start: z.string().min(1),
  end: z.string().min(1),
  allDay: z.coerce.boolean().default(false),
  url: z.string().optional().nullable(),
});

/** Velden die in het logboek bij naam genoemd worden bij een bewerking. */
const EVENT_FIELD_LABELS: Record<string, string> = {
  titleNl: "titel",
  titleEn: "Engelse titel",
  descriptionNl: "beschrijving",
  descriptionEn: "Engelse beschrijving",
  location: "locatie",
  groupId: "groep",
  start: "startmoment",
  end: "eindmoment",
  allDay: "hele dag",
  url: "link",
  imageKey: "afbeelding",
  publishedAt: "publicatiestatus",
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
    titleNl: formData.get("titleNl"),
    titleEn: formData.get("titleEn") || null,
    descriptionNl: formData.get("descriptionNl") || null,
    descriptionEn: formData.get("descriptionEn") || null,
    location: formData.get("location") || null,
    groupId: formData.get("groupId"),
    start: formData.get("start"),
    end: formData.get("end"),
    allDay: formData.get("allDay") === "on",
    url: formData.get("url") || null,
  });
  const image = readImageField(formData);
  if (!parsed.success || image.kind === "invalid") return saveError("INVALID_INPUT");
  const input = parsed.data;
  const categoryIds = formData.getAll("categoryIds").map(String).filter(Boolean);
  const saveAsDraft = formData.get("publication") === "draft";
  // E1: hangt er een logistiek-evenement aan dit evenement?
  const needsLogistics = formData.get("needsLogistics") === "on";

  let start: Date;
  let end: Date;
  try {
    start = localDateTimeToUtc(input.start);
    end = localDateTimeToUtc(input.end);
  } catch {
    return saveError("INVALID_INPUT");
  }
  // Het einde mag niet voor de start liggen. Anders is het evenement tegelijk
  // "aankomend" op de homepage (die op `start` filtert) en "verleden" in de
  // admin (die op `end` filtert): dezelfde datum, twee tegengestelde statussen.
  if (end < start) return saveError("END_BEFORE_START");

  const superOrAll =
    session.user.isSuperAdmin || hasPermission(session, "calendar.manageAll");
  if (!superOrAll && !hasPermission(session, "calendar.create")) {
    throw new Error("forbidden");
  }
  const userGroupIds = session.groups.map((g) => g.id);
  await assertCanManageEvent(userGroupIds, input.groupId, superOrAll);

  const data = {
    titleNl: input.titleNl,
    titleEn: input.titleEn,
    descriptionNl: input.descriptionNl,
    descriptionEn: input.descriptionEn,
    location: input.location,
    groupId: input.groupId,
    start,
    end,
    allDay: input.allDay,
    url: input.url,
    createdById: session.user.id,
  };

  // De categorieën komen als losse checkbox-waarden binnen; alles wegdoen en
  // opnieuw zetten houdt de koppeltabel gelijk aan wat het formulier toont, ook
  // wanneer iemand een vinkje uitzet.
  const setCategories = {
    deleteMany: {},
    create: categoryIds.map((categoryId) => ({ categoryId })),
  };

  let created: { id: string } | null = null;

  if (input.id) {
    const existing = await prisma.calendarEvent.findUnique({ where: { id: input.id } });
    if (!existing) return saveError("INVALID_INPUT");
    await assertCanManageEvent(userGroupIds, existing.groupId, superOrAll);
    const imageKey = resolveImageKey(image, existing.imageKey);
    // De gewone knop publiceert een bestaand concept en bewaart de status van
    // een al gepubliceerd evenement. Alleen de expliciete conceptknop haalt het
    // evenement offline.
    const publishedAt = saveAsDraft ? null : (existing.publishedAt ?? new Date());
    await prisma.calendarEvent.update({
      where: { id: input.id },
      data: { ...data, imageKey, publishedAt, categories: setCategories },
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
      summary: describeChanges(existing, { ...data, imageKey, publishedAt }, EVENT_FIELD_LABELS),
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
    created = await prisma.calendarEvent.create({
      data: {
        ...data,
        imageKey: resolveImageKey(image, null),
        publishedAt: saveAsDraft ? null : new Date(),
        categories: { create: categoryIds.map((categoryId) => ({ categoryId })) },
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
  const { id, kind, ...parsedData } = parsed.data;
  if (kind === "audience" && !parsedData.audience) return saveError("INVALID_INPUT");
  const data = {
    ...parsedData,
    audience: kind === "category" ? null : parsedData.audience,
    showOnCalendarPage: kind === "category" ? parsedData.showOnCalendarPage : false,
  };

  // Een dubbele slug is gewone invoerfout, geen serverfout: hij hoort als rode
  // toast terug te komen in plaats van in de error boundary te belanden.
  const clash = await prisma.calendarCategory.findUnique({ where: { slug: data.slug } });
  if (clash && clash.id !== id) return saveError("SLUG_TAKEN");

  if (id) {
    const existing = await prisma.calendarCategory.findUnique({ where: { id } });
    await prisma.calendarCategory.update({ where: { id }, data });
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
  await logAudit({
    action: "delete",
    entity: "calendarCategory",
    entityId: id,
    target: category.nameNl,
    summary: "de evenementen zelf blijven bestaan",
  });
  revalidateCalendar();
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
