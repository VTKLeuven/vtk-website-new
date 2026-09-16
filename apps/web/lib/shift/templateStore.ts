import 'server-only';

import { prisma } from '@vtk/db';
import { BUILTIN_SHIFT_TEMPLATES, THEOKOT_TEMPLATE_SLUG } from '@vtk/db/shiftTemplates';
import type { BuiltinShiftTemplate } from '@vtk/db/shiftTemplates';
import { brusselsTimeOnDay } from '@/lib/brussels';
import type { ShiftInput } from '@/lib/shift';
import { composeName, type ShiftTemplate } from '@/lib/shift/templates';

/**
 * Lezen en toepassen van de shiftsjablonen uit de databank.
 *
 * Server-only en bewust apart van `lib/shift/templates.ts`: dat bestand wordt
 * ook door het client-scherm geïmporteerd, en Prisma hoort daar niet in.
 */

type TemplateRow = ShiftTemplate;

/**
 * Val terug op de meegeleverde sjablonen zolang de tabel leeg is (een databank
 * die nog niet geseed is). Zonder dit staat het sjabloonscherm er leeg bij en
 * krijgt een Theokot-verkoopweek geen shiften, wat pas opvalt op de dag zelf.
 */
function fromBuiltin(template: BuiltinShiftTemplate): TemplateRow {
  return {
    id: `builtin:${template.slug}`,
    slug: template.slug,
    label: template.label,
    note: template.note ?? null,
    builtIn: true,
    eventName: template.eventName ?? '',
    location: template.location ?? '',
    post: template.post ?? null,
    timeOfDay: template.timeOfDay ?? null,
    shifts: template.shifts.map((entry, index) => ({
      id: `builtin:${template.slug}:${index}`,
      name: entry.name,
      startOffsetMinutes: entry.startOffsetMinutes,
      durationMinutes: entry.durationMinutes,
      maxParticipants: entry.maxParticipants,
      reward: entry.reward,
      description: entry.description,
      instructions: entry.instructions ?? null,
      location: entry.location ?? null,
      ownPost: entry.ownPost ?? false,
      post: entry.post ?? null,
      openToInternationals: entry.openToInternationals ?? false,
      enabled: entry.enabled ?? true,
    })),
  };
}

/** Alle sjablonen met hun shiften, in de volgorde van de keuzelijst. */
export async function listShiftTemplates(): Promise<TemplateRow[]> {
  const rows = await prisma.shiftTemplate.findMany({
    orderBy: [{ order: 'asc' }, { label: 'asc' }],
    // Chronologisch binnen het sjabloon: `order` wordt bij elke opslag op die
    // volgorde gezet, en `startOffsetMinutes` vangt een rij op die daarbuiten
    // ontstond (de seed, of een handmatige ingreep).
    include: { shifts: { orderBy: [{ order: 'asc' }, { startOffsetMinutes: 'asc' }] } },
  });
  if (rows.length === 0) return BUILTIN_SHIFT_TEMPLATES.map(fromBuiltin);
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    label: row.label,
    note: row.note,
    builtIn: row.builtIn,
    eventName: row.eventName,
    location: row.location,
    post: row.post,
    timeOfDay: row.timeOfDay,
    shifts: row.shifts.map((entry) => ({
      id: entry.id,
      name: entry.name,
      startOffsetMinutes: entry.startOffsetMinutes,
      durationMinutes: entry.durationMinutes,
      maxParticipants: entry.maxParticipants,
      reward: entry.reward,
      description: entry.description,
      instructions: entry.instructions,
      location: entry.location,
      ownPost: entry.ownPost,
      post: entry.post,
      openToInternationals: entry.openToInternationals,
      enabled: entry.enabled,
    })),
  }));
}

/** Eén sjabloon op zijn natuurlijke sleutel, of null. */
export async function getShiftTemplate(slug: string): Promise<TemplateRow | null> {
  const all = await listShiftTemplates();
  return all.find((template) => template.slug === slug) ?? null;
}

/**
 * De shiften die bij één Theokot-verkoopdag horen, klaar om aangemaakt te worden.
 *
 * Het anker is het uur waarop die dag afgehaald kan worden (`pickupStart` van de
 * verkoopdag), niet het vaste uur uit het sjabloon: zet je een dag later open,
 * dan schuiven smeren, middag en namiddag mee. De offsets komen wél uit het
 * sjabloon, zodat het scherm /admin/shiften/sjablonen en een verkoopweek exact
 * dezelfde dag neerzetten.
 *
 * Het optellen gebeurt in echte minuten op één kalenderdag. Dat mag hier: de
 * zomertijd verspringt om 03:00 en geen enkele Theokot-shift raakt dat uur.
 */
export async function theokotShiftsForDay(day: Date, pickupStart: string): Promise<ShiftInput[]> {
  const template = await getShiftTemplate(THEOKOT_TEMPLATE_SLUG);
  if (!template) return [];

  const anchor = brusselsTimeOnDay(day, pickupStart);

  return template.shifts
    // Een shift die in het sjabloon standaard uitgevinkt staat, hoort ook hier
    // niet bij de gewone dag: iemand moet ze bewust aanzetten.
    .filter((entry) => entry.enabled)
    .map((entry) => {
      const startTime = new Date(anchor.getTime() + entry.startOffsetMinutes * 60_000);
      return {
        name: composeName(template.eventName, entry.name),
        startTime,
        endTime: new Date(startTime.getTime() + entry.durationMinutes * 60_000),
        location: entry.location ?? template.location,
        description: entry.description,
        maxParticipants: entry.maxParticipants,
        reward: entry.reward,
        post: entry.ownPost ? entry.post : template.post,
        openToInternationals: entry.openToInternationals,
        instructions: entry.instructions,
      };
    });
}

/** De post waaronder een Theokot-verkoopdag bemand wordt, of null. */
export async function theokotShiftPost(): Promise<string | null> {
  const template = await getShiftTemplate(THEOKOT_TEMPLATE_SLUG);
  return template?.post ?? null;
}
