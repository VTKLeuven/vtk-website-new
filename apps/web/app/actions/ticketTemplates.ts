"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@vtk/db";
import type { Prisma } from "@prisma/client";
import { slugify } from "@vtk/db/slug";
import { logAudit } from "@/lib/audit";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import { requirePermission, requireSession } from "@/lib/session";
import { hasPermission } from "@vtk/auth";
import { requireTicketEventCapability } from "@/lib/ticketing/authorization";
import { readTicketDesignSettings } from "@/lib/ticketing/design";
import {
  minutesBeforeFromDate,
  parseTemplateQuestions,
  parseTemplateTypes,
  templateCode,
  templateDesign,
  type TicketTemplateQuestion,
  type TicketTemplateType,
} from "@/lib/ticketing/templates";

/**
 * Het beheer van de ticketsjablonen: de verkoopomgeving die een terugkerend
 * evenement telkens opnieuw nodig heeft (een cantus: vier tickets, één per
 * persoon, verkoop drie dagen vooraf).
 *
 * De tickettypes en de vragen komen als JSON in één verborgen veld binnen, zoals
 * bij de shiftsjablonen: een rij heeft meer dan tien velden waarvan er drie een
 * keuze zijn, en dat in genummerde formuliervelden persen levert enkel een
 * tweede, afwijkende lezing van hetzelfde op.
 *
 * Een sjabloon aanpassen raakt geen enkel bestaand ticketevent: wat al
 * aangemaakt is, staat los in `TicketEvent`. Het raakt wél elk event dat iemand
 * hierna aanmaakt, en daarom hangt dit aan een eigen recht
 * (`tickets.templates`) en niet aan `tickets.create`.
 */

const text = (value: FormDataEntryValue | null) => (typeof value === "string" ? value.trim() : "");

const checkbox = (value: FormDataEntryValue | null) => text(value) === "true" || text(value) === "on";

/** "HH:mm" of leeg; alles anders is geen uur. */
const timeOfDay = (value: string) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : null);

function boundedInt(value: FormDataEntryValue | null, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(text(value), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

/** Een offset in minuten, of null wanneer het veld leeg blijft. */
function optionalOffset(value: FormDataEntryValue | null): number | null {
  const raw = text(value);
  if (raw === "") return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(366 * 1_440, Math.max(-366 * 1_440, parsed));
}

/**
 * De voorverkoop als een getal plus een eenheid, precies zoals het
 * ticketevent ze vraagt (`PresaleFields`). De databank bewaart minuten, zodat
 * er maar één grootheid is om mee te rekenen; leeg of 0 betekent geen
 * voorverkoop.
 */
function presaleLeadMinutes(formData: FormData): number | null {
  const raw = text(formData.get("presaleLeadValue"));
  if (raw === "") return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  const perUnit = text(formData.get("presaleLeadUnit")) === "days" ? 1_440 : 60;
  return Math.min(365 * 1_440, parsed * perUnit);
}

/** Een vrije slug die nog niet bestaat: `cantus`, dan `cantus-2`, ... */
async function freeSlug(label: string): Promise<string> {
  const base = slugify(label) || "sjabloon";
  for (let n = 1; n < 100; n += 1) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    const taken = await prisma.ticketEventTemplate.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

function revalidateTemplates() {
  revalidatePath("/admin/tickets");
  revalidatePath("/admin/tickets/sjablonen");
  revalidatePath("/admin/tickets/new");
}

/** De kindrijen zoals Prisma ze wil, met de volgorde uit het scherm. */
const typeRows = (types: TicketTemplateType[]) =>
  types.map((type, order) => ({
    order,
    code: type.code,
    nameNl: type.nameNl,
    nameEn: type.nameEn,
    descriptionNl: type.descriptionNl,
    descriptionEn: type.descriptionEn,
    unitPriceCents: type.unitPriceCents,
    memberPriceCents: type.memberPriceCents,
    audience: type.audience,
    color: type.color,
    minPerOrder: type.minPerOrder,
    maxPerOrder: type.maxPerOrder,
    salesOpensMinutesBefore: type.salesOpensMinutesBefore,
    salesClosesMinutesBefore: type.salesClosesMinutesBefore,
    enabled: type.enabled,
  }));

const questionRows = (questions: TicketTemplateQuestion[]) =>
  questions.map((question, order) => ({
    order,
    code: question.code,
    labelNl: question.labelNl,
    labelEn: question.labelEn,
    descriptionNl: question.descriptionNl,
    descriptionEn: question.descriptionEn,
    type: question.type,
    required: question.required,
    options: question.options.length > 0 ? question.options : undefined,
    ticketTypeCode: question.ticketTypeCode,
  }));

export async function saveTicketTemplateAction(
  _prev: SaveState,
  formData: FormData
): Promise<SaveState> {
  const session = await requirePermission("tickets.templates");

  const templateId = text(formData.get("templateId")) || null;
  const label = text(formData.get("label"));
  if (label === "") return saveError("LABEL_REQUIRED");

  let typesPayload: unknown;
  let questionsPayload: unknown;
  try {
    typesPayload = JSON.parse(text(formData.get("typesData")) || "null");
    questionsPayload = JSON.parse(text(formData.get("questionsData")) || "null");
  } catch {
    return saveError("INVALID_INPUT");
  }

  const types = parseTemplateTypes(typesPayload);
  if (typeof types === "string") return saveError("INVALID_TICKET_TYPE", `Niet opgeslagen. ${types}`);
  // Een sjabloon zonder tickettype maakt een event dat niets verkoopt en niet
  // gepubliceerd kan worden; dat is geen zinvol vertrekpunt.
  if (types.length === 0) return saveError("NO_TICKET_TYPES");

  const questions = parseTemplateQuestions(questionsPayload);
  if (typeof questions === "string") return saveError("INVALID_QUESTION", `Niet opgeslagen. ${questions}`);

  const ownerGroupId = text(formData.get("ownerGroupId")) || null;
  if (ownerGroupId) {
    const group = await prisma.group.findUnique({ where: { id: ownerGroupId }, select: { id: true } });
    if (!group) return saveError("INVALID_INPUT");
  }

  const salesOpens = optionalOffset(formData.get("salesOpensMinutesBefore"));
  const salesCloses = optionalOffset(formData.get("salesClosesMinutesBefore"));
  if (salesOpens !== null && salesCloses !== null && salesCloses >= salesOpens) {
    return saveError("INVALID_SALES_WINDOW");
  }

  const data = {
    label,
    note: text(formData.get("note")) || null,
    ownerGroupId,
    titleNl: text(formData.get("titleNl")).slice(0, 200),
    titleEn: text(formData.get("titleEn")).slice(0, 200),
    descriptionNl: text(formData.get("descriptionNl")).slice(0, 20_000),
    descriptionEn: text(formData.get("descriptionEn")).slice(0, 20_000),
    location: text(formData.get("location")).slice(0, 300),
    timeOfDay: timeOfDay(text(formData.get("timeOfDay"))),
    durationMinutes: boundedInt(formData.get("durationMinutes"), 300, 15, 14 * 24 * 60),
    salesOpensMinutesBefore: salesOpens,
    salesClosesMinutesBefore: salesCloses,
    maxTicketsPerOrder: boundedInt(formData.get("maxTicketsPerOrder"), 8, 1, 50),
    contactEmail: text(formData.get("contactEmail")) || null,
    cardCheckIn: checkbox(formData.get("cardCheckIn")),
    openScanning: checkbox(formData.get("openScanning")),
    presaleLeadMinutes: presaleLeadMinutes(formData),
    presalePraesidium: checkbox(formData.get("presalePraesidium")),
    presaleHelpers: checkbox(formData.get("presaleHelpers")),
    confirmationMessageNl: text(formData.get("confirmationMessageNl")).slice(0, 5_000),
    confirmationMessageEn: text(formData.get("confirmationMessageEn")).slice(0, 5_000),
    capacity: boundedInt(formData.get("capacity"), 100, 1, 1_000_000),
  };

  if (templateId) {
    const existing = await prisma.ticketEventTemplate.findUnique({
      where: { id: templateId },
      select: { id: true },
    });
    if (!existing) return saveError("TEMPLATE_GONE");

    // De kindrijen worden vervangen, niet bijgewerkt: rijen kunnen verdwenen,
    // bijgekomen en van plaats gewisseld zijn, en niets buiten dit sjabloon
    // verwijst ernaar. Eén transactie, zodat een fout halverwege geen sjabloon
    // zonder tickettypes achterlaat.
    await prisma.$transaction([
      prisma.ticketEventTemplateType.deleteMany({ where: { templateId } }),
      prisma.ticketEventTemplateQuestion.deleteMany({ where: { templateId } }),
      prisma.ticketEventTemplate.update({
        where: { id: templateId },
        data: {
          ...data,
          types: { create: typeRows(types) },
          questions: { create: questionRows(questions) },
        },
      }),
    ]);

    await logAudit({
      action: "update",
      entity: "ticketTemplate",
      entityId: templateId,
      target: label,
      summary: `${types.length} tickettype(s), ${questions.length} vraag/vragen`,
    });
    revalidateTemplates();
    return saveOk();
  }

  const created = await prisma.ticketEventTemplate.create({
    data: {
      ...data,
      slug: await freeSlug(label),
      // Nieuw sjabloon: mag verwijderd worden. `builtIn` is enkel voor wat uit
      // de seed komt.
      builtIn: false,
      order: await prisma.ticketEventTemplate.count(),
      createdById: session.user.id,
      types: { create: typeRows(types) },
      questions: { create: questionRows(questions) },
    },
    select: { id: true },
  });

  await logAudit({
    action: "create",
    entity: "ticketTemplate",
    entityId: created.id,
    target: label,
    summary: `${types.length} tickettype(s), ${questions.length} vraag/vragen`,
  });
  revalidateTemplates();
  return saveOk();
}

export async function deleteTicketTemplateAction(formData: FormData): Promise<void> {
  await requirePermission("tickets.templates");
  const id = text(formData.get("templateId"));
  if (!id) return;

  const template = await prisma.ticketEventTemplate.findUnique({
    where: { id },
    select: { id: true, label: true, builtIn: true },
  });
  // Een meegeleverd sjabloon verdwijnt niet; bewerken mag wel. Zo blijft er na
  // een enthousiaste opkuis altijd één werkend vertrekpunt staan.
  if (!template || template.builtIn) return;

  await prisma.ticketEventTemplate.delete({ where: { id } });
  await logAudit({ action: "delete", entity: "ticketTemplate", entityId: id, target: template.label });
  revalidateTemplates();
}

/**
 * "Bewaar als sjabloon" vanuit een bestaand ticketevent.
 *
 * Het eerste sjabloon van een post bestaat al: het is de cantus die vorige week
 * verkocht werd. Die overtypen in een leeg beheerscherm is precies het werk dat
 * deze functie moest wegnemen, dus nemen we het event over: tickettypes,
 * capaciteit, vragen, ontwerp, teksten en instellingen. De datums worden
 * offsets t.o.v. de start van dat event.
 */
export async function saveTicketTemplateFromEventAction(
  _prev: SaveState,
  formData: FormData
): Promise<SaveState> {
  const session = await requireSession();
  if (!hasPermission(session, "tickets.templates")) return saveError("FORBIDDEN");

  const eventId = text(formData.get("eventId"));
  if (!eventId) return saveError("INVALID_INPUT");
  // Je mag enkel een sjabloon maken van een event dat je zelf mag beheren.
  await requireTicketEventCapability(eventId, "MANAGE_EVENT");

  const label = text(formData.get("label"));
  if (label === "") return saveError("LABEL_REQUIRED");

  const event = await prisma.ticketEvent.findUnique({
    where: { id: eventId },
    include: {
      ticketTypes: { orderBy: { sortOrder: "asc" } },
      questions: { orderBy: { sortOrder: "asc" } },
      inventoryPools: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!event) return saveError("TEMPLATE_GONE");

  const activeTypes = event.ticketTypes.filter((type) => type.active);
  if (activeTypes.length === 0) return saveError("NO_TICKET_TYPES");

  const typeById = new Map(event.ticketTypes.map((type) => [type.id, type]));
  const design = templateDesign(readTicketDesignSettings(event.settings, event.id).draft);
  const startsAt = event.startsAt;
  // Wandkloktijd in Brussel, zodat "20:00" ook na de winteruurwissel 20:00 blijft.
  const timeOfDayFromEvent = new Intl.DateTimeFormat("en-GB", {
    timeZone: event.timeZone || "Europe/Brussels",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(startsAt);

  const created = await prisma.ticketEventTemplate.create({
    data: {
      slug: await freeSlug(label),
      label,
      note: text(formData.get("note")) || null,
      ownerGroupId: event.ownerGroupId,
      titleNl: event.titleNl,
      titleEn: event.titleEn ?? "",
      descriptionNl: event.descriptionNl ?? "",
      descriptionEn: event.descriptionEn ?? "",
      location: event.location ?? "",
      locationAddress: event.locationAddress,
      locationLatitude: event.locationLatitude,
      locationLongitude: event.locationLongitude,
      timeOfDay: timeOfDayFromEvent,
      durationMinutes: Math.max(
        15,
        Math.round((event.endsAt.getTime() - startsAt.getTime()) / 60_000)
      ),
      salesOpensMinutesBefore: minutesBeforeFromDate(startsAt, event.salesStartAt),
      salesClosesMinutesBefore: minutesBeforeFromDate(startsAt, event.salesEndAt),
      maxTicketsPerOrder: event.maxTicketsPerOrder,
      contactEmail: event.contactEmail,
      cardCheckIn: event.cardCheckIn,
      openScanning: event.openScanning,
      presaleLeadMinutes: event.presaleLeadMinutes,
      presalePraesidium: event.presalePraesidium,
      presaleHelpers: event.presaleHelpers,
      confirmationMessageNl: event.confirmationMessageNl ?? "",
      confirmationMessageEn: event.confirmationMessageEn ?? "",
      capacity: event.inventoryPools[0]?.capacity ?? 100,
      design: (design ?? undefined) as Prisma.InputJsonValue | undefined,
      builtIn: false,
      order: await prisma.ticketEventTemplate.count(),
      createdById: session.user.id,
      types: {
        create: activeTypes.map((type, order) => ({
          order,
          code: templateCode(type.code, `TYPE_${order + 1}`),
          nameNl: type.nameNl,
          nameEn: type.nameEn ?? "",
          descriptionNl: type.descriptionNl ?? "",
          descriptionEn: type.descriptionEn ?? "",
          unitPriceCents: type.unitPriceCents,
          memberPriceCents: type.memberPriceCents,
          audience: type.audience,
          color: type.color,
          minPerOrder: type.minPerOrder,
          maxPerOrder: type.maxPerOrder,
          salesOpensMinutesBefore: minutesBeforeFromDate(startsAt, type.salesStartAt),
          salesClosesMinutesBefore: minutesBeforeFromDate(startsAt, type.salesEndAt),
          enabled: true,
        })),
      },
      questions: {
        create: event.questions
          .filter((question) => question.active)
          .map((question, order) => ({
            order,
            code: templateCode(question.code, `VRAAG_${order + 1}`),
            labelNl: question.labelNl,
            labelEn: question.labelEn ?? "",
            descriptionNl: question.descriptionNl ?? "",
            descriptionEn: question.descriptionEn ?? "",
            type: question.type,
            required: question.required,
            options: question.options ?? undefined,
            ticketTypeCode: question.ticketTypeId
              ? (typeById.get(question.ticketTypeId)?.code ?? null)
              : null,
          })),
      },
    },
    select: { id: true, label: true },
  });

  await logAudit({
    action: "create",
    entity: "ticketTemplate",
    entityId: created.id,
    target: created.label,
    summary: `bewaard vanuit "${event.titleNl}"`,
  });
  revalidateTemplates();
  return saveOk();
}
