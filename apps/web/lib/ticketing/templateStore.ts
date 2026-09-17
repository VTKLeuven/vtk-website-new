import "server-only";

import { prisma } from "@vtk/db";
import {
  BUILTIN_TICKET_EVENT_TEMPLATES,
  type BuiltinTicketTemplate,
} from "@vtk/db/ticketEventTemplates";
import type { TicketEventTemplate } from "./templates";

/**
 * Lezen van de ticketsjablonen uit de databank.
 *
 * Server-only en bewust apart van `lib/ticketing/templates.ts`: dat bestand
 * wordt ook door het aanmaak- en beheerscherm geïmporteerd, en Prisma hoort
 * daar niet in.
 */

/**
 * Val terug op de meegeleverde sjablonen zolang de tabel leeg is (een databank
 * die nog niet geseed is). Zonder dit staat de keuzelijst bij het aanmaken er
 * leeg bij en lijkt de functie stuk.
 */
function fromBuiltin(template: BuiltinTicketTemplate): TicketEventTemplate {
  return {
    id: `builtin:${template.slug}`,
    slug: template.slug,
    label: template.label,
    note: template.note ?? null,
    ownerGroupId: null,
    titleNl: template.titleNl ?? "",
    titleEn: template.titleEn ?? "",
    descriptionNl: template.descriptionNl ?? "",
    descriptionEn: template.descriptionEn ?? "",
    location: template.location ?? "",
    locationAddress: null,
    locationLatitude: null,
    locationLongitude: null,
    timeOfDay: template.timeOfDay ?? null,
    durationMinutes: template.durationMinutes ?? 300,
    salesOpensMinutesBefore: template.salesOpensMinutesBefore ?? null,
    salesClosesMinutesBefore: template.salesClosesMinutesBefore ?? null,
    maxTicketsPerOrder: template.maxTicketsPerOrder ?? 8,
    contactEmail: template.contactEmail ?? null,
    cardCheckIn: template.cardCheckIn ?? false,
    openScanning: template.openScanning ?? true,
    presaleLeadMinutes: template.presaleLeadMinutes ?? null,
    presalePraesidium: template.presalePraesidium ?? true,
    presaleHelpers: template.presaleHelpers ?? true,
    confirmationMessageNl: template.confirmationMessageNl ?? "",
    confirmationMessageEn: template.confirmationMessageEn ?? "",
    capacity: template.capacity ?? 100,
    design: null,
    builtIn: true,
    types: template.types.map((type) => ({
      code: type.code,
      nameNl: type.nameNl,
      nameEn: type.nameEn ?? "",
      descriptionNl: type.descriptionNl ?? "",
      descriptionEn: type.descriptionEn ?? "",
      unitPriceCents: type.unitPriceCents,
      memberPriceCents: type.memberPriceCents ?? null,
      audience: type.audience ?? "PUBLIC",
      color: type.color ?? "navy",
      minPerOrder: type.minPerOrder ?? 1,
      maxPerOrder: type.maxPerOrder ?? 8,
      salesOpensMinutesBefore: type.salesOpensMinutesBefore ?? null,
      salesClosesMinutesBefore: type.salesClosesMinutesBefore ?? null,
      enabled: type.enabled ?? true,
    })),
    questions: (template.questions ?? []).map((question) => ({
      code: question.code,
      labelNl: question.labelNl,
      labelEn: question.labelEn ?? "",
      descriptionNl: question.descriptionNl ?? "",
      descriptionEn: question.descriptionEn ?? "",
      type: question.type,
      required: question.required ?? false,
      options: question.options ?? [],
      ticketTypeCode: question.ticketTypeCode ?? null,
    })),
  };
}

// Chronologisch binnen het sjabloon: `order` wordt bij elke opslag opnieuw
// gezet, en `code` vangt een rij op die daarbuiten ontstond (de seed).
const include = {
  types: { orderBy: [{ order: "asc" as const }, { code: "asc" as const }] },
  questions: { orderBy: [{ order: "asc" as const }, { code: "asc" as const }] },
};

type Row = Awaited<ReturnType<typeof prisma.ticketEventTemplate.findMany>>[number] & {
  types: Awaited<ReturnType<typeof prisma.ticketEventTemplateType.findMany>>;
  questions: Awaited<ReturnType<typeof prisma.ticketEventTemplateQuestion.findMany>>;
};

function toTemplate(row: Row): TicketEventTemplate {
  return {
    id: row.id,
    slug: row.slug,
    label: row.label,
    note: row.note,
    ownerGroupId: row.ownerGroupId,
    titleNl: row.titleNl,
    titleEn: row.titleEn,
    descriptionNl: row.descriptionNl,
    descriptionEn: row.descriptionEn,
    location: row.location,
    locationAddress: row.locationAddress,
    locationLatitude: row.locationLatitude,
    locationLongitude: row.locationLongitude,
    timeOfDay: row.timeOfDay,
    durationMinutes: row.durationMinutes,
    salesOpensMinutesBefore: row.salesOpensMinutesBefore,
    salesClosesMinutesBefore: row.salesClosesMinutesBefore,
    maxTicketsPerOrder: row.maxTicketsPerOrder,
    contactEmail: row.contactEmail,
    cardCheckIn: row.cardCheckIn,
    openScanning: row.openScanning,
    presaleLeadMinutes: row.presaleLeadMinutes,
    presalePraesidium: row.presalePraesidium,
    presaleHelpers: row.presaleHelpers,
    confirmationMessageNl: row.confirmationMessageNl,
    confirmationMessageEn: row.confirmationMessageEn,
    capacity: row.capacity,
    design: row.design ?? null,
    builtIn: row.builtIn,
    types: row.types.map((type) => ({
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
    })),
    questions: row.questions.map((question) => ({
      code: question.code,
      labelNl: question.labelNl,
      labelEn: question.labelEn,
      descriptionNl: question.descriptionNl,
      descriptionEn: question.descriptionEn,
      type: question.type,
      required: question.required,
      options: Array.isArray(question.options)
        ? question.options.filter((option): option is string => typeof option === "string")
        : [],
      ticketTypeCode: question.ticketTypeCode,
    })),
  };
}

/** Alle sjablonen met hun tickettypes en vragen, in de volgorde van de lijst. */
export async function listTicketEventTemplates(): Promise<TicketEventTemplate[]> {
  const rows = await prisma.ticketEventTemplate.findMany({
    orderBy: [{ order: "asc" }, { label: "asc" }],
    include,
  });
  if (rows.length === 0) return BUILTIN_TICKET_EVENT_TEMPLATES.map(fromBuiltin);
  return rows.map((row) => toTemplate(row as Row));
}

/** Eén sjabloon op zijn slug; null wanneer het niet (meer) bestaat. */
export async function getTicketEventTemplate(slug: string): Promise<TicketEventTemplate | null> {
  const row = await prisma.ticketEventTemplate.findUnique({ where: { slug }, include });
  if (row) return toTemplate(row as Row);
  const builtin = BUILTIN_TICKET_EVENT_TEMPLATES.find((template) => template.slug === slug);
  return builtin ? fromBuiltin(builtin) : null;
}

/** Idem op id, voor het beheerscherm. */
export async function getTicketEventTemplateById(id: string): Promise<TicketEventTemplate | null> {
  const row = await prisma.ticketEventTemplate.findUnique({ where: { id }, include });
  return row ? toTemplate(row as Row) : null;
}
